/**
 * SearchService — centralized search/grounding service.
 *
 * Wraps the AI service's search methods with:
 * - Request jitter (200-700ms between calls) to avoid burst detection
 * - Batch chunking (configurable, default 5 per batch)
 * - Noisy domain/URL filtering (server-side only)
 * - UI-ready response normalization
 * - Grounding metadata (groundedAt timestamp, sourceUrl)
 *
 * All Google Search grounding now goes exclusively through this service.
 * The client receives fully-formed JSON — no parsing on the frontend.
 */
import type { ServerAIService, ShoppingOption, LocalSupplier } from './types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BATCH_SIZE = 5;
const JITTER_MIN_MS = 200;
const JITTER_MAX_MS = 700;

// In-memory response cache. Reusing a grounded result within the TTL window
// avoids re-hitting the Google Search grounding API, which is both costly and
// the primary cause of API key throttling/blacklisting.
const CACHE_TTL_MS = Number(process.env.GOOGLE_SEARCH_CACHE_TTL_MS || 60 * 60 * 1000);
const MAX_CACHE_ENTRIES = 500;

interface CacheEntry {
  at: number;
  value: SearchResult;
}

const resultCache = new Map<string, CacheEntry>();

function cacheKey(query: string, localeContext?: string): string {
  return `${(localeContext || 'en').toLowerCase()}:${query.trim().toLowerCase()}`;
}

function cacheGet(key: string): SearchResult | null {
  const hit = resultCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    resultCache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key: string, value: SearchResult): void {
  if (resultCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = resultCache.keys().next().value;
    if (oldestKey) resultCache.delete(oldestKey);
  }
  resultCache.set(key, { at: Date.now(), value });
}

/** Clears the in-memory grounded-result cache (used between tests). */
export function resetSearchCache(): void {
  resultCache.clear();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a random delay between min and max milliseconds. */
function jitterMs(): number {
  return JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS));
}

/** Sleep for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GroundedShoppingOption extends ShoppingOption {
  /** ISO timestamp of when grounding was performed. */
  groundedAt: string;
  /** The raw source URL from the grounding chunk. */
  sourceUrl: string;
}

export interface SearchResult {
  query: string;
  options: GroundedShoppingOption[];
  localSuppliers: LocalSupplier[];
  groundedAt: string;
}

export interface HydrateResult {
  query: string;
  details: Partial<any> | null;
  groundedAt: string;
}

export interface BatchSearchResult {
  results: SearchResult[];
  totalDurationMs: number;
  batchCount: number;
}

// ---------------------------------------------------------------------------
// SearchService
// ---------------------------------------------------------------------------

export class SearchService {
  private ai: ServerAIService;

  constructor(aiService: ServerAIService) {
    this.ai = aiService;
  }

  /**
   * Search for sourcing options for a single part, reporting HOW the result
   * was produced:
   * - `fromCache: true`  → served from the TTL cache, OR produced by the
   *   GOOGLE_SEARCH_ENABLED=0 kill-switch (neither performed real grounding).
   * - `fromCache: false` → fresh grounding ran against the AI service (this
   *   includes the graceful error fallback, which still burned an attempt).
   *
   * Routes use this flag to decide whether to charge the daily search quota.
   */
  async findSourcesWithMeta(
    query: string,
    designContext?: string,
    localeContext?: string,
    preferredVendors?: string[]
  ): Promise<{ result: SearchResult; fromCache: boolean }> {
    // Serve from cache when a grounded result for the same query/locale exists.
    // Cached hits skip the Google Search grounding API entirely.
    const key = cacheKey(query, localeContext);
    const cached = cacheGet(key);
    if (cached) return { result: cached, fromCache: true };

    // Master toggle: when GOOGLE_SEARCH_ENABLED=0 the Google search grounding
    // is bypassed entirely so the app falls back to the verified pipeline.
    // NOTE: deliberately NOT cached — empty kill-switch stubs must never evict
    // real grounded results or pin a query to emptiness until the TTL lapses.
    if (process.env.GOOGLE_SEARCH_ENABLED === '0') {
      const result: SearchResult = { query, options: [], localSuppliers: [], groundedAt: new Date().toISOString() };
      return { result, fromCache: true };
    }

    const groundedAt = new Date().toISOString();
    await sleep(jitterMs());

    try {
      const [options, localSuppliers] = await Promise.all([
        this.ai.findPartSources(query, designContext, localeContext, preferredVendors),
        this.ai.findLocalSuppliers(query),
      ]);

      const result: SearchResult = {
        query,
        options: this.normalizeOptions(options || [], groundedAt),
        localSuppliers: localSuppliers || [],
        groundedAt,
      };
      cacheSet(key, result);
      return { result, fromCache: false };
    } catch (e: any) {
      console.error(`[SearchService] findSources failed for "${query}":`, e?.message || e);
      return { result: { query, options: [], localSuppliers: [], groundedAt }, fromCache: false };
    }
  }

  /**
   * Search for sourcing options for a single part.
   * Includes jitter delay before the API call.
   * Thin convenience wrapper around {@link findSourcesWithMeta} — see that
   * method for caching/kill-switch semantics.
   */
  async findSources(
    query: string,
    designContext?: string,
    localeContext?: string,
    preferredVendors?: string[]
  ): Promise<SearchResult> {
    const { result } = await this.findSourcesWithMeta(query, designContext, localeContext, preferredVendors);
    return result;
  }

  /**
   * Ground ONLY the local-supplier leg for a query.
   * Used by the /local endpoint, which cares exclusively about nearby stores —
   * running the full findSources() pipeline there would pay for a redundant
   * findPartSources() web-grounding call on every request.
   * Includes the usual jitter delay; failures degrade to an empty list.
   */
  async findLocalSuppliersOnly(query: string): Promise<LocalSupplier[]> {
    await sleep(jitterMs());
    try {
      const suppliers = await this.ai.findLocalSuppliers(query);
      return suppliers || [];
    } catch (e: any) {
      console.error(`[SearchService] findLocalSuppliersOnly failed for "${query}":`, e?.message || e);
      return [];
    }
  }

  /**
   * Hydrate a part with real-world data (brand, price, ports, etc.).
   * Includes jitter delay before the API call.
   */
  async hydratePart(
    name: string,
    category: string,
    designContext?: string,
    localeContext?: string,
    preferredVendors?: string[]
  ): Promise<HydrateResult> {
    const groundedAt = new Date().toISOString();
    await sleep(jitterMs());

    try {
      const details = await this.ai.hydratePartDetails(name, category, designContext, localeContext, preferredVendors);
      return { query: name, details, groundedAt };
    } catch (e: any) {
      console.error(`[SearchService] hydratePart failed for "${name}":`, e?.message || e);
      return { query: name, details: null, groundedAt };
    }
  }

  /**
   * Batch search for multiple parts.
   * Groups into chunks of BATCH_SIZE, with jitter between chunks.
   */
  async batchSearch(
    queries: Array<{ query: string; designContext?: string; localeContext?: string; preferredVendors?: string[] }>
  ): Promise<BatchSearchResult> {
    const { result } = await this.batchSearchWithMeta(queries);
    return result;
  }

  /**
   * Batch search that additionally reports `freshCount` — how many of the
   * queries required FRESH grounding (i.e., were NOT served from the TTL
   * cache and did not hit the kill-switch). Lets the /batch route charge the
   * daily search quota once per genuinely-grounded query instead of per item.
   */
  async batchSearchWithMeta(
    queries: Array<{ query: string; designContext?: string; localeContext?: string; preferredVendors?: string[] }>
  ): Promise<{ result: BatchSearchResult; freshCount: number }> {
    const start = Date.now();
    const results: SearchResult[] = [];
    let freshCount = 0;

    // Split into chunks
    const chunks: typeof queries[] = [];
    for (let i = 0; i < queries.length; i += BATCH_SIZE) {
      chunks.push(queries.slice(i, i + BATCH_SIZE));
    }

    for (const chunk of chunks) {
      // Process items within a chunk concurrently (each has its own jitter)
      const chunkResults = await Promise.all(
        chunk.map(q => this.findSourcesWithMeta(q.query, q.designContext, q.localeContext, q.preferredVendors))
      );
      results.push(...chunkResults.map(r => r.result));
      freshCount += chunkResults.filter(r => !r.fromCache).length;

      // Extra jitter between chunks (if more chunks remain)
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await sleep(jitterMs());
      }
    }

    return {
      result: {
        results,
        totalDurationMs: Date.now() - start,
        batchCount: chunks.length,
      },
      freshCount,
    };
  }

  /**
   * Batch hydrate for multiple parts.
   */
  async batchHydrate(
    parts: Array<{ name: string; category: string; designContext?: string; localeContext?: string; preferredVendors?: string[] }>
  ): Promise<{ results: HydrateResult[]; totalDurationMs: number }> {
    const start = Date.now();
    const results: HydrateResult[] = [];

    const chunks: typeof parts[] = [];
    for (let i = 0; i < parts.length; i += BATCH_SIZE) {
      chunks.push(parts.slice(i, i + BATCH_SIZE));
    }

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(p => this.hydratePart(p.name, p.category, p.designContext, p.localeContext, p.preferredVendors))
      );
      results.push(...chunkResults);

      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await sleep(jitterMs());
      }
    }

    return { results, totalDurationMs: Date.now() - start };
  }

  /**
   * Normalize raw ShoppingOptions into GroundedShoppingOptions with metadata.
   */
  private normalizeOptions(options: ShoppingOption[], groundedAt: string): GroundedShoppingOption[] {
    return options.map(opt => ({
      ...opt,
      groundedAt,
      sourceUrl: opt.url || '',
    }));
  }
}
