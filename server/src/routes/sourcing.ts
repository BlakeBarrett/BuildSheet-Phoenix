/**
 * Sourcing routes — find sources, hydrate parts, local suppliers, procurement pipeline.
 *
 * All search/grounding operations go through SearchService, which adds
 * request jitter, batch chunking, and UI-ready response normalization.
 */
import { Router, type Request, type Response } from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import {
  generationRateLimit,
  searchRateLimit,
  searchQuota,
  searchQuotaRemaining,
  consumeSearchQuota,
} from '../middleware/rateLimit.js';
import type { ServerAIService } from '../services/types.js';
import { SearchService } from '../services/searchService.js';

export const sourcingRouter = Router();

function getAI(req: Request): ServerAIService {
  return (req as any).aiService;
}

function getSearchService(req: Request): SearchService {
  return new SearchService(getAI(req));
}

/**
 * POST /api/v1/sourcing/find
 * Body: { query, designContext?, localeContext?, preferredVendors? }
 *
 * Returns fully-formed, UI-ready JSON with grounding metadata.
 */
sourcingRouter.post('/find', optionalAuth, searchRateLimit, searchQuota, async (req: Request, res: Response) => {
  const { query, designContext, localeContext, preferredVendors } = req.body;
  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({ error: 'query is required' }); return;
  }

  try {
    const search = getSearchService(req);
    const { result, fromCache } = await search.findSourcesWithMeta(query, designContext, localeContext, preferredVendors);
    // Charge the daily quota only for real grounding work — TTL-cache hits
    // (and kill-switch stubs) are free.
    if (!fromCache) consumeSearchQuota(req);
    // Return flat arrays for backward compat with existing client code
    res.json({ results: result.options, localSuppliers: result.localSuppliers, groundedAt: result.groundedAt });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/sourcing/search
 * Body: { query, designContext?, localeContext?, preferredVendors? }
 *
 * Google AI product search — returns structured, web-wide purchase options
 * (title, price, source, url) plus local suppliers. Used by the Google Search
 * Kit modal and the Search & Source flow.
 */
sourcingRouter.post('/search', requireAuth, searchRateLimit, searchQuota, async (req: Request, res: Response) => {
  const { query, designContext, localeContext, preferredVendors } = req.body;
  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({ error: 'query is required' }); return;
  }

  try {
    const search = getSearchService(req);
    const { result, fromCache } = await search.findSourcesWithMeta(query, designContext, localeContext, preferredVendors);
    // Same contract as /find: cache-served responses never burn daily quota.
    if (!fromCache) consumeSearchQuota(req);
    res.json({
      query,
      products: result.options,
      localSuppliers: result.localSuppliers,
      groundedAt: result.groundedAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/sourcing/hydrate
 * Body: { name, category, designContext?, localeContext?, preferredVendors? }
 *
 * Returns hydrated part details with grounding metadata.
 */
sourcingRouter.post('/hydrate', optionalAuth, searchRateLimit, searchQuota, async (req: Request, res: Response) => {
  const { name, category, designContext, localeContext, preferredVendors } = req.body;
  if (!name || typeof name !== 'string' || !name.trim() || !category || typeof category !== 'string' || !category.trim()) {
    res.status(400).json({ error: 'name and category are required' }); return;
  }

  try {
    const search = getSearchService(req);
    const result = await search.hydratePart(name.trim(), category.trim(), designContext, localeContext, preferredVendors);
    // Hydration only consumes quota when fresh grounding actually happened.
    // The openai-compat branch does not use Google Search grounding, and any
    // provider failure returns { details: null } without grounding.
    if (result.details !== null) consumeSearchQuota(req);
    res.json({ result: result.details, groundedAt: result.groundedAt });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/sourcing/local
 * Body: { query }
 *
 * Returns local supplier results.
 */
sourcingRouter.post('/local', optionalAuth, searchRateLimit, searchQuota, async (req: Request, res: Response) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({ error: 'query is required' }); return;
  }

  try {
    const search = getSearchService(req);
    // Local-only grounding: skips findPartSources() entirely (no wasted
    // web-wide grounding when the caller only wants nearby suppliers).
    const suppliers = await search.findLocalSuppliersOnly(query.trim());
    // No quota charge under the kill-switch: nothing touched Google.
    if (process.env.GOOGLE_SEARCH_ENABLED !== '0') {
      consumeSearchQuota(req);
    }
    res.json({ results: suppliers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/sourcing/batch
 * Body: { queries: [{ query, designContext?, localeContext?, preferredVendors? }] }
 *
 * Batch search for multiple parts at once. Server handles chunking and jitter.
 * Returns all results in a single response.
 */
sourcingRouter.post('/batch', requireAuth, searchRateLimit, searchQuota, async (req: Request, res: Response) => {
  const { queries } = req.body;
  if (!Array.isArray(queries) || queries.length === 0) {
    res.status(400).json({ error: 'queries array is required' }); return;
  }
  if (queries.length > 50) {
    res.status(400).json({ error: 'Maximum 50 queries per batch' }); return;
  }
  if (!queries.every(q => q && typeof q.query === 'string' && q.query.trim())) {
    res.status(400).json({ error: 'every query must be a non-empty string' }); return;
  }

  // Up-front quota reservation for multi-unit requests: without this, a
  // 50-item batch would run ALL its grounding and only then discover the
  // requester's daily allowance was already spent (work done, results
  // unusable, budget blown past the cap). Worst-case fresh count is bounded
  // by queries.length since cache/kill-switch hits are free.
  const remaining = searchQuotaRemaining(req);
  if (remaining < queries.length) {
    res.status(429).json({
      error: `Daily search quota exceeded — ${remaining} of ${queries.length} required searches remain today.`,
      retryAfterMs: -1,
    });
    return;
  }

  try {
    const search = getSearchService(req);
    // batchSearchWithMeta reports how many queries needed FRESH grounding;
    // cache-served (and kill-switch) items are free, the rest each cost one
    // unit of daily quota — charged via a single consume call.
    const { result, freshCount } = await search.batchSearchWithMeta(queries);
    if (freshCount > 0) consumeSearchQuota(req, freshCount);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/sourcing/procure
 * Full verified procurement pipeline (SearXNG → Firecrawl → LLM verification).
 * Body: { query, category, designContext?, localeContext?, preferredVendors? }
 */
sourcingRouter.post('/procure', requireAuth, generationRateLimit, async (req: Request, res: Response) => {
  const { query, category, designContext, localeContext, preferredVendors } = req.body;
  if (!query || typeof query !== 'string' || !query.trim() || !category || typeof category !== 'string' || !category.trim()) {
    res.status(400).json({ error: 'query and category are required' }); return;
  }

  try {
    // Import procurement engine dynamically (heavy dependency)
    const { VerifiedProcurementEngine } = await import('../services/procurementEngine.js');
    const ai = getAI(req);
    const engine = new VerifiedProcurementEngine({}, ai);
    const result = await engine.procure(query, category, designContext, localeContext, preferredVendors);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
