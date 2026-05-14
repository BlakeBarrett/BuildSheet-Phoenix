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
   * Search for sourcing options for a single part.
   * Includes jitter delay before the API call.
   */
  async findSources(
    query: string,
    designContext?: string,
    localeContext?: string,
    preferredVendors?: string[]
  ): Promise<SearchResult> {
    const groundedAt = new Date().toISOString();
    await sleep(jitterMs());

    try {
      const [options, localSuppliers] = await Promise.all([
        this.ai.findPartSources(query, designContext, localeContext, preferredVendors),
        this.ai.findLocalSuppliers(query),
      ]);

      return {
        query,
        options: this.normalizeOptions(options || [], groundedAt),
        localSuppliers: localSuppliers || [],
        groundedAt,
      };
    } catch (e: any) {
      console.error(`[SearchService] findSources failed for "${query}":`, e?.message || e);
      return { query, options: [], localSuppliers: [], groundedAt };
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
    const start = Date.now();
    const results: SearchResult[] = [];

    // Split into chunks
    const chunks: typeof queries[] = [];
    for (let i = 0; i < queries.length; i += BATCH_SIZE) {
      chunks.push(queries.slice(i, i + BATCH_SIZE));
    }

    for (const chunk of chunks) {
      // Process items within a chunk concurrently (each has its own jitter)
      const chunkResults = await Promise.all(
        chunk.map(q => this.findSources(q.query, q.designContext, q.localeContext, q.preferredVendors))
      );
      results.push(...chunkResults);

      // Extra jitter between chunks (if more chunks remain)
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await sleep(jitterMs());
      }
    }

    return {
      results,
      totalDurationMs: Date.now() - start,
      batchCount: chunks.length,
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
