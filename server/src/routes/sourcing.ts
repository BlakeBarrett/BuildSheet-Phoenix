/**
 * Sourcing routes — find sources, hydrate parts, local suppliers, procurement pipeline.
 *
 * All search/grounding operations go through SearchService, which adds
 * request jitter, batch chunking, and UI-ready response normalization.
 */
import { Router, type Request, type Response } from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { apiRateLimit, generationRateLimit } from '../middleware/rateLimit.js';
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
sourcingRouter.post('/find', optionalAuth, apiRateLimit, async (req: Request, res: Response) => {
  const { query, designContext, localeContext, preferredVendors } = req.body;
  if (!query) { res.status(400).json({ error: 'query is required' }); return; }

  try {
    const search = getSearchService(req);
    const result = await search.findSources(query, designContext, localeContext, preferredVendors);
    // Return flat arrays for backward compat with existing client code
    res.json({ results: result.options, localSuppliers: result.localSuppliers, groundedAt: result.groundedAt });
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
sourcingRouter.post('/hydrate', optionalAuth, apiRateLimit, async (req: Request, res: Response) => {
  const { name, category, designContext, localeContext, preferredVendors } = req.body;
  if (!name || !category) { res.status(400).json({ error: 'name and category are required' }); return; }

  try {
    const search = getSearchService(req);
    const result = await search.hydratePart(name, category, designContext, localeContext, preferredVendors);
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
sourcingRouter.post('/local', optionalAuth, apiRateLimit, async (req: Request, res: Response) => {
  const { query } = req.body;
  if (!query) { res.status(400).json({ error: 'query is required' }); return; }

  try {
    const search = getSearchService(req);
    const result = await search.findSources(query);
    res.json({ results: result.localSuppliers });
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
sourcingRouter.post('/batch', requireAuth, apiRateLimit, async (req: Request, res: Response) => {
  const { queries } = req.body;
  if (!Array.isArray(queries) || queries.length === 0) {
    res.status(400).json({ error: 'queries array is required' }); return;
  }
  if (queries.length > 50) {
    res.status(400).json({ error: 'Maximum 50 queries per batch' }); return;
  }

  try {
    const search = getSearchService(req);
    const result = await search.batchSearch(queries);
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
  if (!query || !category) { res.status(400).json({ error: 'query and category are required' }); return; }

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
