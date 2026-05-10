/**
 * Sourcing routes — find sources, hydrate parts, local suppliers, procurement pipeline.
 */
import { Router, type Request, type Response } from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { apiRateLimit, generationRateLimit } from '../middleware/rateLimit.js';
import type { ServerAIService } from '../services/types.js';

export const sourcingRouter = Router();

function getAI(req: Request): ServerAIService {
  return (req as any).aiService;
}

/**
 * POST /api/v1/sourcing/find
 * Body: { query, designContext?, localeContext?, preferredVendors? }
 */
sourcingRouter.post('/find', optionalAuth, apiRateLimit, async (req: Request, res: Response) => {
  const { query, designContext, localeContext, preferredVendors } = req.body;
  if (!query) { res.status(400).json({ error: 'query is required' }); return; }

  try {
    const ai = getAI(req);
    const results = await ai.findPartSources(query, designContext, localeContext, preferredVendors);
    res.json({ results: results || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/sourcing/hydrate
 * Body: { name, category, designContext?, localeContext?, preferredVendors? }
 */
sourcingRouter.post('/hydrate', optionalAuth, apiRateLimit, async (req: Request, res: Response) => {
  const { name, category, designContext, localeContext, preferredVendors } = req.body;
  if (!name || !category) { res.status(400).json({ error: 'name and category are required' }); return; }

  try {
    const ai = getAI(req);
    const result = await ai.hydratePartDetails(name, category, designContext, localeContext, preferredVendors);
    res.json({ result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/sourcing/local
 * Body: { query }
 */
sourcingRouter.post('/local', optionalAuth, apiRateLimit, async (req: Request, res: Response) => {
  const { query } = req.body;
  if (!query) { res.status(400).json({ error: 'query is required' }); return; }

  try {
    const ai = getAI(req);
    const results = await ai.findLocalSuppliers(query);
    res.json({ results: results || [] });
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
