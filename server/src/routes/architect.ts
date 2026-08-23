/**
 * Architect routes — chat (SSE streaming), verify, assembly plan, apply-audit, correction.
 */
import { Router, type Request, type Response } from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { apiRateLimit, generationRateLimit } from '../middleware/rateLimit.js';
import type { ServerAIService } from '../services/types.js';
import { VerifiedFactService } from '../services/verifiedFactService.js';
import { getFirestore } from 'firebase-admin/firestore';

export const architectRouter = Router();

/**
 * The public fact-service surface used by these routes. Defined structurally so
 * both VerifiedFactService and the degraded-mode stub satisfy it without casts.
 */
type FactServiceLike = Pick<VerifiedFactService,
  'storeFact' | 'getFact' | 'searchFacts' | 'updateFact' | 'deleteFact'>;

// Lazy-initialize factService to avoid Firebase errors at module load time
let _factService: FactServiceLike | null = null;
function getFactService(): FactServiceLike {
  if (!_factService) {
    try {
      _factService = new VerifiedFactService(getFirestore());
    } catch (err: any) {
      console.warn('[architect] VerifiedFactService unavailable:', err.message);
      // Return a stub service that fails gracefully. Method names mirror
      // VerifiedFactService's real API so callers never hit a TypeError.
      _factService = {
        storeFact: async () => { throw new Error('VerifiedFactService unavailable'); },
        getFact: async () => null,
        searchFacts: async () => [],
        updateFact: async () => null,
        deleteFact: async () => false,
      };
    }
  }
  return _factService;
}

function getAI(req: Request): ServerAIService {
  return (req as any).aiService;
}

/**
 * POST /api/v1/architect/chat — SSE streaming architect chat.
 * 
 * The response is sent as Server-Sent Events so the client can
 * render partial results as they arrive.
 * 
 * Body: { prompt: string, history: any[], image?: string }
 * SSE events: { type: 'chunk', data: string } | { type: 'done', data: { text, metadata } }
 */
architectRouter.post('/chat', optionalAuth, apiRateLimit, async (req: Request, res: Response) => {
  const { prompt, history = [], image } = req.body;
  if (!prompt) { res.status(400).json({ error: 'prompt is required' }); return; }

  const ai = getAI(req);

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  try {
    // For now, we get the full response and stream it in chunks.
    // TODO: When the Gemini SDK supports true streaming, switch to generateContentStream.
    const result = await ai.askArchitect(prompt, history, image);
    const text = result.text;

    // Simulate streaming by sending the text in chunks
    const chunkSize = 80;
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.substring(i, i + chunkSize);
      res.write(`data: ${JSON.stringify({ type: 'chunk', data: chunk })}\n\n`);
    }

    // Send the final event with full result + metadata
    res.write(`data: ${JSON.stringify({ type: 'done', data: result })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error('[architect/chat] Error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', data: err.message })}\n\n`);
    res.end();
  }
});

/**
 * POST /api/v1/architect/verify — Design verification / audit.
 * Body: { bom, requirements, previousAudit?, advancedChecks? }
 */
architectRouter.post('/verify', requireAuth, generationRateLimit, async (req: Request, res: Response) => {
  const { bom, requirements, previousAudit, advancedChecks } = req.body;
  if (!bom || !requirements) { res.status(400).json({ error: 'bom and requirements are required' }); return; }

  try {
    const ai = getAI(req);
    const result = await ai.verifyDesign(bom, requirements, previousAudit, advancedChecks);
    res.json(result);
  } catch (err: any) {
    console.error('[architect/verify] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/architect/assembly-plan
 * Body: { bom, previousPlan? }
 */
architectRouter.post('/assembly-plan', requireAuth, generationRateLimit, async (req: Request, res: Response) => {
  const { bom, previousPlan } = req.body;
  if (!bom) { res.status(400).json({ error: 'bom is required' }); return; }

  try {
    const ai = getAI(req);
    const plan = await ai.generateAssemblyPlan(bom, previousPlan);
    res.json(plan);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/architect/apply-audit
 * Body: { bom, auditResult, requirements }
 */
architectRouter.post('/apply-audit', requireAuth, apiRateLimit, async (req: Request, res: Response) => {
  const { bom, auditResult, requirements } = req.body;
  if (!bom || !auditResult || !requirements) { res.status(400).json({ error: 'bom, auditResult, and requirements are required' }); return; }

  try {
    const ai = getAI(req);
    const result = await ai.applyAuditRecommendations(bom, auditResult, requirements);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/architect/correct — User correction submission.
 * Body: { statement, category?, evidence?, tags? }
 * Creates a pending verified fact for admin review.
 */
architectRouter.post('/correct', optionalAuth, apiRateLimit, async (req: Request, res: Response) => {
  const { statement, category, evidence, tags = [] } = req.body;

  if (!statement) {
    res.status(400).json({ error: 'statement is required' });
    return;
  }

  // Validate category
  const validCategories = ['component-specs', 'compatibility', 'requirements', 'procurement', 'general'];
  if (category && !validCategories.includes(category)) {
    res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
    return;
  }

  try {
    // optionalAuth guarantees req.user is set; the field is `uid` (not `id`).
    const userId = (req as any).user?.uid;

    // Only include createdBy when a user is authenticated — Firestore rejects
    // explicit `undefined` values, so anonymous corrections must omit the key.
    const factInput: Record<string, any> = {
      category: (category as any) || 'general',
      statement,
      // `source` is a provenance field — server-controlled so arbitrary user
      // text can never masquerade as a trusted origin.
      source: 'user-correction',
      confidence: 0.5, // Default confidence for user submissions
      tags,
      status: 'pending'
    };
    if (typeof evidence === 'string' && evidence.trim()) factInput.evidence = evidence.trim();
    if (userId) factInput.createdBy = userId;

    const fact = await getFactService().storeFact(factInput as any);

    res.status(201).json({
      message: 'Correction submitted for review',
      factId: fact.factId,
      status: fact.status
    });
  } catch (err: any) {
    // Corrections are best-effort persistence. Firestore credential/outage
    // failures degrade gracefully (503) instead of leaking raw errors.
    const msg = err?.message || String(err);
    const isCredError = msg.includes('credentials')
      || msg.includes('Could not load the default')
      || msg.includes('Failed to connect to Firestore');
    if (isCredError) {
      console.warn('[architect/correct] Firestore unavailable — returning 503:', msg);
      res.status(503).json({
        error: 'Sync service unavailable. Your correction will not be persisted until the server has valid cloud credentials.',
        syncUnavailable: true,
      });
      return;
    }
    console.error('[architect/correct] Error:', msg);
    res.status(500).json({ error: msg });
  }
});
