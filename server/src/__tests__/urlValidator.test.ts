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
import { validateShoppingOptions, resetUrlValidationCache, _setDnsResolverForTests } from '../services/urlValidator.js';
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

describe('validateShoppingOptions — hardening', () => {
  beforeEach(() => {
    resetUrlValidationCache();
    delete process.env.GOOGLE_SEARCH_VALIDATE_URLS;
    delete process.env.URL_VALIDATION_TIMEOUT_MS;
    delete process.env.URL_VALIDATION_CACHE_TTL_MS;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    _setDnsResolverForTests();
  });

  it('probes with HEAD first and only falls back to ranged GET on 405', async () => {
    const fetchMock = vi.fn(async () => res(200));
    vi.stubGlobal('fetch', fetchMock);

    await validateShoppingOptions([option('https://shop.example.com/head')]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown[])[1]).toMatchObject({ method: 'HEAD' });
  });

  it('retries a 405 with a ranged GET', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(405))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchMock);

    const [out] = await validateShoppingOptions([option('https://strict.example.com/part')]);

    expect(out.validated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1] as unknown[])[1]).toMatchObject({ method: 'GET' });
    expect(((fetchMock.mock.calls[1] as unknown[])[1] as any).headers.Range).toBe('bytes=0-0');
  });

  it('allows initial request plus MAX_REDIRECT_HOPS redirects before giving up', async () => {
    // Chain of exactly three redirects must RESOLVE, not exit inconclusive.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(301, 'https://hop1.example.com/a'))
      .mockResolvedValueOnce(res(301, 'https://hop2.example.com/b'))
      .mockResolvedValueOnce(res(301, 'https://final.example.com/c'))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchMock);

    const [out] = await validateShoppingOptions([option('https://start.example.com/go')]);

    expect(out.validated).toBe(true);
    expect(out.url).toBe('https://final.example.com/c');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('drops non-http(s) schemes even when validation is disabled', async () => {
    vi.stubEnv('GOOGLE_SEARCH_VALIDATE_URLS', '0');
    const fetchMock = vi.fn(async () => res(200));
    vi.stubGlobal('fetch', fetchMock);

    const out = await validateShoppingOptions([
      option('javascript:fetch("/steal")', { title: 'XSS' }),
      option('https://shop.example.com/ok', { title: 'Ok' }),
    ]);

    expect(out.map(o => o.title)).toEqual(['Ok']);
    expect(fetchMock).not.toHaveBeenCalled(); // Kill switch still means no probing.
  });

  it('drops non-http(s) schemes in the normal path instead of flagging them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(200)));

    const out = await validateShoppingOptions([
      option('data:text/html,<script>alert(1)</script>', { title: 'Data' }),
      option('file:///etc/passwd', { title: 'File' }),
    ]);

    expect(out).toEqual([]);
  });

  it('refuses to probe hostnames that resolve into protected ranges (SSRF)', async () => {
    _setDnsResolverForTests(async () => [{ address: '127.0.0.1', family: 4 }]);
    const fetchMock = vi.fn(async () => res(200));
    vi.stubGlobal('fetch', fetchMock);

    const [out] = await validateShoppingOptions([option('http://internal.attacker.example/secret')]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.validated).toBe(false);
    expect(out.isEstimated).toBe(true); // Inconclusive, never dropped on our own caution.
  });

  it('blocks IP-literal metadata/loopback targets without consulting DNS', async () => {
    let dnsCalls = 0;
    _setDnsResolverForTests(async () => { dnsCalls++; return []; });
    const fetchMock = vi.fn(async () => res(200));
    vi.stubGlobal('fetch', fetchMock);

    const out = await validateShoppingOptions([
      option('http://169.254.169.254/latest/meta-data/', { title: 'Metadata' }),
      option('http://127.0.0.1:8080/api/v1/health', { title: 'Loopback' }),
      option('http://10.1.2.3/internal', { title: 'RFC1918' }),
    ]);

    expect(dnsCalls).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.map(o => o.validated)).toEqual([false, false, false]);
  });
});
