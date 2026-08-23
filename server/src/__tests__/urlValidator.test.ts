/**
 * Tests for the server-side shopping-link validator (urlValidator.ts).
 *
 * The validator probes each candidate product URL server-side: it follows
 * manual redirect chains (Gemini grounding hands out vertexaisearch redirect
 * wrappers), drops dead (404/410) pages, and flags anything inconclusive
 * (bot walls, timeouts, network errors) instead of dropping it.
 *
 * fetch is stubbed globally; every probe here is offline.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateShoppingOptions, resetUrlValidationCache } from '../services/urlValidator.js';
import type { ShoppingOption } from '../services/types.js';

function option(url: string, overrides: Partial<ShoppingOption> = {}): ShoppingOption {
  return { title: 'ATmega328P', url, source: 'TestShop', price: '$4.50', ...overrides };
}

/** Minimal Response stand-in: the validator only reads status + Location. */
function res(status: number, location?: string) {
  return {
    ok: status >= 200 && status < 400,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'location' ? (location ?? null) : null) },
  };
}

describe('validateShoppingOptions', () => {
  beforeEach(() => {
    resetUrlValidationCache();
    // Tests assume validation is ON unless a case explicitly disables it.
    delete process.env.GOOGLE_SEARCH_VALIDATE_URLS;
    delete process.env.URL_VALIDATION_TIMEOUT_MS;
    delete process.env.URL_VALIDATION_CACHE_TTL_MS;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('keeps a reachable (200) URL and marks it validated', async () => {
    const fetchMock = vi.fn(async () => res(200));
    vi.stubGlobal('fetch', fetchMock);

    const [out] = await validateShoppingOptions([option('https://shop.example.com/p1')]);

    expect(out.validated).toBe(true);
    expect(out.url).toBe('https://shop.example.com/p1');
    expect(out.isEstimated).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Redirects must be followed manually — never auto.
    expect((fetchMock.mock.calls[0] as unknown[])[1]).toMatchObject({ redirect: 'manual' });
  });

  it('follows a 301 redirect chain and swaps in the final destination URL', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(301, 'https://www.mouser.com/ProductDetail/real'))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchMock);

    const [out] = await validateShoppingOptions([option('https://vertexaisearch.cloud.google.com/redirect/me')]);

    expect(out.url).toBe('https://www.mouser.com/ProductDetail/real');
    expect(out.validated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://www.mouser.com/ProductDetail/real');
  });

  it('drops options whose URL is dead (404/410)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('gone')) return res(404);
      if (url.includes('retired')) return res(410);
      return res(200);
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await validateShoppingOptions([
      option('https://shop.example.com/gone', { title: 'Gone' }),
      option('https://shop.example.com/live', { title: 'Live' }),
      option('https://shop.example.com/retired', { title: 'Retired' }),
    ]);

    expect(out.map(o => o.title)).toEqual(['Live']);
  });

  it('flags bot-walled (403) URLs as inconclusive but keeps the ORIGINAL url', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(403)));

    const [out] = await validateShoppingOptions([option('https://guarded.example.com/part')]);

    expect(out.validated).toBe(false);
    expect(out.isEstimated).toBe(true);
    // Never swap the known url for an unverified "resolved" one.
    expect(out.url).toBe('https://guarded.example.com/part');
  });

  it('flags network errors as inconclusive and keeps the original url', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND unreachable.example.com');
    }));

    const [out] = await validateShoppingOptions([option('https://unreachable.example.com/part')]);

    expect(out.validated).toBe(false);
    expect(out.isEstimated).toBe(true);
    expect(out.url).toBe('https://unreachable.example.com/part');
  });

  it('skips validation entirely when GOOGLE_SEARCH_VALIDATE_URLS=0', async () => {
    vi.stubEnv('GOOGLE_SEARCH_VALIDATE_URLS', '0');
    // A dead URL that would be dropped if probed — proves no fetch happens.
    const fetchMock = vi.fn(async () => res(404));
    vi.stubGlobal('fetch', fetchMock);
    const input = [option('https://shop.example.com/dead')];

    const out = await validateShoppingOptions(input);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(out).toEqual(input);
  });

  it('serves repeated lookups from the TTL cache without refetching', async () => {
    const fetchMock = vi.fn(async () => res(200));
    vi.stubGlobal('fetch', fetchMock);

    const first = await validateShoppingOptions([option('https://shop.example.com/cached')]);
    const second = await validateShoppingOptions([option('https://shop.example.com/cached')]);

    expect(fetchMock).toHaveBeenCalledTimes(1); // Second call was a cache hit.
    expect(first[0].validated).toBe(true);
    expect(second[0].validated).toBe(true);
    expect(second[0].url).toBe(first[0].url);
  });
});
