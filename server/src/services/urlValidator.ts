/**
 * Server-side URL validation & redirect resolution for shopping options.
 *
 * WHY: Gemini grounding chunks hand out vertexaisearch.cloud.google.com
 * redirect wrappers, and model-generated URLs can be outright hallucinated —
 * either way users get broken "Buy" links. Before an option is surfaced we
 * probe its URL server-side (manual redirect following), then classify it:
 *
 *   - reachable (2xx)  -> keep; swap in the resolved destination URL
 *   - dead (404/410)   -> drop the option entirely
 *   - anything else    -> inconclusive: keep the ORIGINAL url but flag it
 *     (403 bot walls and 429 rate limits say nothing about whether the
 *     product page actually exists, so we never drop on them)
 *
 * Probes are cached in-memory (TTL + FIFO cap) so repeated searches for the
 * same part don't hammer retailer servers.
 *
 * SAFETY: model/user-supplied URLs are untrusted input. Every target --
 * including every redirect hop -- must be public HTTP(S): non-http(s)
 * schemes are rejected outright, and DNS-resolved addresses are checked
 * against loopback/RFC1918/link-local/metadata ranges before each request
 * (server-side request forgery guard). Residual risk: classic TOCTOU DNS
 * rebinding between our lookup and undici's own resolution; pinning would
 * require a custom dispatcher and is deliberately deferred.
 */
import { lookup as systemDnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isHttpUrl } from '../../../services/urlUtils.js';
import type { ShoppingOption } from './types.js';

/** Public shape of a single URL probe (also what lands in the cache). */
export interface UrlValidationResult {
  ok: boolean;
  resolvedUrl?: string;
}

/** Internal tri-state: `invalid` drops the option, `inconclusive` flags it. */
type Verdict = 'ok' | 'invalid' | 'inconclusive';
interface ProbedUrl extends UrlValidationResult {
  verdict: Verdict;
}

const INCONCLUSIVE: ProbedUrl = { ok: false, verdict: 'inconclusive' };
const INVALID: ProbedUrl = { ok: false, verdict: 'invalid' };

/** Total requests per probe, including the first — bounds redirect chains. */
const MAX_REDIRECT_HOPS = 3;
/** Parallel probes in flight — bounded so bursts stay polite to retailers. */
const VALIDATION_CONCURRENCY = 5;
/** FIFO cap on the probe cache; the oldest entry is evicted beyond this. */
const CACHE_MAX_ENTRIES = 1000;

// Module-level TTL cache keyed by normalized (trimmed, lowercased) URL.
const validationCache = new Map<string, { at: number; result: ProbedUrl }>();

/** Clear the probe cache (test hook). */
export function resetUrlValidationCache(): void {
  validationCache.clear();
}

// --- SSRF guard -------------------------------------------------------------

type DnsEntry = { address: string; family: number };
let resolveHost: (host: string) => Promise<DnsEntry[]> =
  (host) => systemDnsLookup(host, { all: true }) as unknown as Promise<DnsEntry[]>;

/** @internal Test seam: override the DNS resolver used by the SSRF guard. */
export function _setDnsResolverForTests(fn?: (host: string) => Promise<DnsEntry[]>): void {
  resolveHost = fn ?? ((host) => systemDnsLookup(host, { all: true }) as unknown as Promise<DnsEntry[]>);
}

// Re-export the shared helper so callers can import it from this module.
export { isHttpUrl } from '../../../services/urlUtils.js';

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/** Loopback / RFC1918 / CGNAT / link-local (incl. cloud metadata) / this-network. */
const BLOCKED_V4_RANGES: Array<[number, number]> = [
  [0x00000000, 0xff000000], // 0.0.0.0/8
  [0x0a000000, 0xff000000], // 10.0.0.0/8
  [0x7f000000, 0xff000000], // 127.0.0.0/8
  [0xa9fe0000, 0xffff0000], // 169.254.0.0/16 (link-local + metadata)
  [0xac100000, 0xfff00000], // 172.16.0.0/12
  [0xc0a80000, 0xffff0000], // 192.168.0.0/16
  [0x64400000, 0xffc00000], // 100.64.0.0/10 (CGNAT)
];

function isBlockedIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // Unparseable — treat as hostile.
  // `>>> 0`: bitwise AND yields a SIGNED int32 — without the shift,
  // ranges >= 128.0.0.0 (e.g. 169.254/16) never match their base literal.
  return BLOCKED_V4_RANGES.some(([base, mask]) => ((n & mask) >>> 0) === base);
}

function isBlockedAddress(address: string, family: number): boolean {
  if (family === 4) return isBlockedIPv4(address);
  const a = address.toLowerCase();
  if (a === '::1' || a === '::') return true;
  if (a.startsWith('::ffff:')) return isBlockedIPv4(a.slice(7)); // v4-mapped
  const firstHextet = a.split(':')[0];
  if (/^fe[89ab]$/.test(firstHextet)) return true; // fe80::/10 link-local
  if (/^f[cd]$/.test(firstHextet)) return true;    // fc00::/7 unique-local
  return false;
}

/**
 * Returns false when the target must NOT be fetched: non-http(s) scheme,
 * unparseable URL, or a hostname/IP resolving into protected space.
 * DNS-resolution failures intentionally PASS through — the subsequent fetch
 * will fail on its own and map to the ordinary inconclusive verdict.
 */
async function isSafePublicTarget(urlStr: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  const host = u.hostname.replace(/^\[/, '').replace(/\]$/, '');
  const literalFamily = isIP(host);
  if (literalFamily) return !isBlockedAddress(host, literalFamily);

  try {
    const entries = await resolveHost(host);
    return !entries.some(e => isBlockedAddress(e.address, e.family));
  } catch {
    return true; // Unresolvable here — the probe itself will surface the failure.
  }
}

/**
 * Browser-shaped headers. GET carries Range so compliant servers send one
 * byte instead of the full page body.
 */
function browserHeaders(method: 'GET' | 'HEAD'): Record<string, string> {
  return {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    Accept: 'text/html',
    ...(method === 'GET' ? { Range: 'bytes=0-0' } : {}),
  };
}

/** One network request. Returns null on timeout/DNS/TLS failures. */
async function fetchOnce(url: string, method: 'GET' | 'HEAD'): Promise<{ status: number; location: string | null } | null> {
  try {
    const resp = await fetch(url, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(Number(process.env.URL_VALIDATION_TIMEOUT_MS || 4000)),
      headers: browserHeaders(method),
    });
    return { status: resp.status, location: resp.headers?.get?.('location') ?? null };
  } catch {
    return null;
  }
}

/**
 * Probe one URL: HEAD the start URL, then follow up to MAX_REDIRECT_HOPS
 * manual redirects; the FINAL hop's status decides the verdict. A 405 gets
 * exactly one ranged-GET retry — some storefronts reject plain probes but
 * serve ranged requests fine.
 */
async function probeUrl(startUrl: string): Promise<ProbedUrl> {
  let current = startUrl;
  // Loop bound: the initial request PLUS MAX_REDIRECT_HOPS redirects.
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    if (!(await isSafePublicTarget(current))) return INCONCLUSIVE;

    let resp = await fetchOnce(current, 'HEAD');
    if (resp?.status === 405) resp = await fetchOnce(current, 'GET');
    if (!resp) return INCONCLUSIVE;

    if (resp.status >= 300 && resp.status < 400) {
      if (!resp.location) return INCONCLUSIVE; // Redirect with nowhere to go.
      try {
        current = new URL(resp.location, current).toString();
      } catch {
        return INCONCLUSIVE; // Malformed Location header — chain unverifiable.
      }
      continue;
    }

    if (resp.status >= 200 && resp.status < 300) return { ok: true, verdict: 'ok', resolvedUrl: current };
    if (resp.status === 404 || resp.status === 410) return INVALID;
    return INCONCLUSIVE; // 403/429/5xx/etc. — can't tell, don't punish the link.
  }
  return INCONCLUSIVE; // Still redirecting after the hop budget.
}

/** Cache-aware probe: hits skip the network entirely; stale entries refetch. */
async function probeWithCache(cacheKey: string, requestUrl: string): Promise<ProbedUrl> {
  const ttl = Number(process.env.URL_VALIDATION_CACHE_TTL_MS || 30 * 60 * 1000);
  const hit = validationCache.get(cacheKey);
  if (hit && Date.now() - hit.at < ttl) return hit.result;
  validationCache.delete(cacheKey); // Drop expired entries instead of refreshing.

  const result = await probeUrl(requestUrl);

  // FIFO eviction: Maps iterate in insertion order, so the first key is oldest.
  while (validationCache.size >= CACHE_MAX_ENTRIES && !validationCache.has(cacheKey)) {
    const oldest = validationCache.keys().next().value;
    if (oldest === undefined) break;
    validationCache.delete(oldest);
  }
  validationCache.set(cacheKey, { at: Date.now(), result });
  return result;
}

/**
 * Validate every option's URL server-side and map verdicts back in original
 * order:
 *   ok           -> `{ ...opt, url: resolvedUrl || opt.url, validated: true }`
 *   invalid      -> option omitted from the output
 *   inconclusive -> `{ ...opt, validated: false, isEstimated: true }` keeping
 *                   the ORIGINAL url (never trade a known value for an
 *                   unverified redirect/hallucination target)
 */
export async function validateShoppingOptions(options: ShoppingOption[]): Promise<ShoppingOption[]> {
  // Kill switch read at CALL time (not module load) so tests/deployments can
  // toggle validation without code changes. Even with probing disabled we
  // still drop non-http(s) URLs: a `javascript:` href straight from a model
  // response is an executable-link injection, never a shopping option.
  if (process.env.GOOGLE_SEARCH_VALIDATE_URLS === '0') {
    return options.filter(opt => isHttpUrl(opt.url));
  }

  // Dedupe: options often repeat a URL. Normalization must preserve path/query
  // casing — only the hostname is case-insensitive. Lowercasing the whole URL
  // would make `/Part` and `/part` collide, hiding a valid listing or keeping
  // an invalid one.
  const unique = new Map<string, string>(); // normalized -> representative URL
  for (const opt of options) {
    const url = (opt.url || '').trim();
    if (!/^https?:\/\//i.test(url)) continue; // Not probeable; flagged below.
    try {
      const parsed = new URL(url);
      const key = `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname}${parsed.search}`;
      if (!unique.has(key)) unique.set(key, url);
    } catch {
      // Unparseable but http(s)-ish — fall back to the trimmed URL as its own key.
      unique.set(url, url);
    }
  }

  // Bounded-concurrency worker pool over the unique URLs.
  const targets = [...unique.entries()];
  const verdicts = new Map<string, ProbedUrl>();
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(VALIDATION_CONCURRENCY, targets.length) }, async () => {
      while (cursor < targets.length) {
        const [key, url] = targets[cursor++];
        verdicts.set(key, await probeWithCache(key, url));
      }
    }),
  );

  return options.flatMap((opt): ShoppingOption[] => {
    const url = (opt.url || '').trim();
    // Scheme safety is absolute: never emit a non-http(s) href to the client.
    if (!isHttpUrl(url)) return [];
    let key: string;
    try {
      const parsed = new URL(url);
      key = `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname}${parsed.search}`;
    } catch {
      key = url;
    }
    const result = verdicts.get(key);
    if (!result || result.verdict === 'inconclusive') {
      return [{ ...opt, validated: false, isEstimated: true }];
    }
    if (!result.ok) return []; // Dead product page (404/410).
    return [{ ...opt, url: result.resolvedUrl || opt.url, validated: true }];
  });
}
