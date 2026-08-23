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
 */
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

/** Browser-shaped headers: many retailers 403 obvious bots outright. */
function browserHeaders(withRange: boolean): Record<string, string> {
  return {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    Accept: 'text/html',
    // Range asks servers to send a single byte — cheap for both sides.
    ...(withRange ? { Range: 'bytes=0-0' } : {}),
  };
}

/** One network request. Returns null on timeout/DNS/TLS failures. */
async function fetchOnce(url: string, withRange: boolean): Promise<{ status: number; location: string | null } | null> {
  try {
    const resp = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(Number(process.env.URL_VALIDATION_TIMEOUT_MS || 4000)),
      headers: browserHeaders(withRange),
    });
    return { status: resp.status, location: resp.headers?.get?.('location') ?? null };
  } catch {
    return null;
  }
}

/**
 * Probe one URL: follow up to MAX_REDIRECT_HOPS manual redirects; the FINAL
 * hop's status decides the verdict. A 405 gets exactly one GET+Range retry —
 * some storefronts reject plain probes but serve ranged requests fine.
 */
async function probeUrl(startUrl: string): Promise<ProbedUrl> {
  let current = startUrl;
  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    let resp = await fetchOnce(current, false);
    if (resp?.status === 405) resp = await fetchOnce(current, true);
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
  // toggle validation without code changes.
  if (process.env.GOOGLE_SEARCH_VALIDATE_URLS === '0') return options;

  // Dedupe: options often repeat a URL or differ only by case/whitespace.
  const unique = new Map<string, string>(); // normalized -> representative URL
  for (const opt of options) {
    const url = (opt.url || '').trim();
    if (!/^https?:\/\//i.test(url)) continue; // Not probeable; flagged below.
    const key = url.toLowerCase();
    if (!unique.has(key)) unique.set(key, url);
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
    const result = /^https?:\/\//i.test(url) ? verdicts.get(url.toLowerCase()) : undefined;
    if (!result || result.verdict === 'inconclusive') {
      return [{ ...opt, validated: false, isEstimated: true }];
    }
    if (!result.ok) return []; // Dead product page (404/410).
    return [{ ...opt, url: result.resolvedUrl || opt.url, validated: true }];
  });
}
