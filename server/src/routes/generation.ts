/**
 * Generation routes — image, fabrication, QA, enclosure, component ID.
 */
import { Router, type Request, type Response } from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { generationRateLimit } from '../middleware/rateLimit.js';
import type { ServerAIService } from '../services/types.js';

export const generationRouter = Router();

function getAI(req: Request): ServerAIService {
  return (req as any).aiService;
}

/** POST /api/v1/generate/image — Body: { description, referenceImage? } */
generationRouter.post('/image', optionalAuth, generationRateLimit, async (req: Request, res: Response) => {
  const { description, referenceImage } = req.body;
  if (!description) { res.status(400).json({ error: 'description is required' }); return; }
  try {
    const url = await getAI(req).generateProductImage(description, referenceImage);
    res.json({ url });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

/** POST /api/v1/generate/fabrication — Body: { partName, context } */
generationRouter.post('/fabrication', requireAuth, generationRateLimit, async (req: Request, res: Response) => {
  const { partName, context } = req.body;
  if (!partName || !context) { res.status(400).json({ error: 'partName and context are required' }); return; }
  try {
    const brief = await getAI(req).generateFabricationBrief(partName, context);
    res.json({ brief });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

/** POST /api/v1/generate/qa-protocol — Body: { partName, category } */
generationRouter.post('/qa-protocol', requireAuth, generationRateLimit, async (req: Request, res: Response) => {
  const { partName, category } = req.body;
  if (!partName || !category) { res.status(400).json({ error: 'partName and category are required' }); return; }
  try {
    const protocol = await getAI(req).generateQAProtocol(partName, category);
    res.json(protocol);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

/** POST /api/v1/generate/enclosure — Body: { context, bom } */
generationRouter.post('/enclosure', requireAuth, generationRateLimit, async (req: Request, res: Response) => {
  const { context, bom } = req.body;
  if (!context || !bom) { res.status(400).json({ error: 'context and bom are required' }); return; }
  try {
    const spec = await getAI(req).generateEnclosure(context, bom);
    res.json(spec);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

/** POST /api/v1/generate/identify — Body: { image } */
generationRouter.post('/identify', optionalAuth, generationRateLimit, async (req: Request, res: Response) => {
  const { image } = req.body;
  if (!image) { res.status(400).json({ error: 'image is required' }); return; }
  try {
    const result = await getAI(req).identifyComponent(image);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

/** POST /api/v1/generate/ar-guidance — Body: { image, currentStep, plan } */
generationRouter.post('/ar-guidance', optionalAuth, generationRateLimit, async (req: Request, res: Response) => {
  const { image, currentStep, plan } = req.body;
  if (!image || currentStep === undefined || !plan) {
    res.status(400).json({ error: 'image, currentStep, and plan are required' }); return;
  }
  try {
    const guidance = await getAI(req).getARGuidance(image, currentStep, plan);
    res.json(guidance);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
