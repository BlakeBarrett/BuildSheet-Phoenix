/**
 * Tests for the Architect routes' resilience.
 *
 * Verifies:
 * - /chat streams an SSE error event (HTTP 200) when the AI service throws,
 *   instead of crashing the route.
 * - /correct degrades gracefully (503 + syncUnavailable) when Firestore is
 *   unavailable (credential errors), instead of leaking raw 500s.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';

const { mockStoreFact } = vi.hoisted(() => ({ mockStoreFact: vi.fn() }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({}),
}));

vi.mock('../services/verifiedFactService.js', () => ({
  VerifiedFactService: vi.fn(function (this: any) {
    this.storeFact = mockStoreFact;
    this.getFact = vi.fn();
    this.searchFacts = vi.fn();
    this.updateFact = vi.fn();
    this.deleteFact = vi.fn();
  }),
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (_req: any, _res: any, next: any) => {
    _req.user = { id: 'user-1', uid: 'user-1' };
    next();
  },
  optionalAuth: (_req: any, _res: any, next: any) => {
    // x-anon header simulates an unauthenticated (guest) user
    if (_req.get('x-anon') !== '1') {
      _req.user = { id: 'user-1', uid: 'user-1' };
    }
    next();
  },
}));

vi.mock('../middleware/rateLimit.js', () => ({
  apiRateLimit: (_req: any, _res: any, next: any) => next(),
  generationRateLimit: (_req: any, _res: any, next: any) => next(),
}));

import { architectRouter } from '../routes/architect.js';

class MockAI {
  askArchitect = vi.fn();
  verifyDesign = vi.fn();
  generateAssemblyPlan = vi.fn();
  applyAuditRecommendations = vi.fn();
}

function createTestApp(ai: MockAI) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => { req.aiService = ai; next(); });
  app.use('/api/v1/architect', architectRouter);
  return app;
}

async function startServer(app: express.Application, pathPrefix: string): Promise<string> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as any;
      resolve(`http://localhost:${addr.port}${pathPrefix}`);
    });
    setTimeout(() => server.close(), 5000);
  });
}

describe('Architect routes — resilience', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { mockStoreFact.mockReset(); });

  describe('POST /chat', () => {
    it('streams an SSE error event (HTTP 200) when askArchitect throws', async () => {
      const ai = new MockAI();
      ai.askArchitect.mockRejectedValue(new Error('upstream AI down'));
      const baseUrl = await startServer(createTestApp(ai), '/api/v1/architect');

      const res = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'hello' }),
      });

      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('"type":"error"');
      expect(body).toContain('upstream AI down');
    });

    it('rejects a request without a prompt', async () => {
      const ai = new MockAI();
      const baseUrl = await startServer(createTestApp(ai), '/api/v1/architect');

      const res = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /correct', () => {
    it('returns 503 + syncUnavailable when Firestore credentials are missing', async () => {
      mockStoreFact.mockRejectedValue(new Error('Could not load the default credentials.'));
      const ai = new MockAI();
      const baseUrl = await startServer(createTestApp(ai), '/api/v1/architect');

      const res = await fetch(`${baseUrl}/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statement: 'A resistor limits current.', category: 'component-specs' }),
      });

      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.syncUnavailable).toBe(true);
    });

    it('returns 201 when the fact is stored successfully', async () => {
      mockStoreFact.mockResolvedValue({
        factId: 'fact-abc',
        status: 'pending',
        category: 'component-specs',
        statement: 'A resistor limits current.',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const ai = new MockAI();
      const baseUrl = await startServer(createTestApp(ai), '/api/v1/architect');

      const res = await fetch(`${baseUrl}/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statement: 'A resistor limits current.', category: 'component-specs' }),
      });

      expect(res.status).toBe(201);
    });

    it('rejects an invalid category', async () => {
      const ai = new MockAI();
      const baseUrl = await startServer(createTestApp(ai), '/api/v1/architect');

      const res = await fetch(`${baseUrl}/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statement: 'x', category: 'not-a-real-category' }),
      });

      expect(res.status).toBe(400);
    });

    it('omits createdBy for anonymous (guest) corrections', async () => {
      mockStoreFact.mockResolvedValue({
        factId: 'fact-anon',
        status: 'pending',
        category: 'general',
        statement: 'x',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const ai = new MockAI();
      const baseUrl = await startServer(createTestApp(ai), '/api/v1/architect');

      const res = await fetch(`${baseUrl}/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-anon': '1' },
        body: JSON.stringify({ statement: 'Guest correction' }),
      });

      expect(res.status).toBe(201);
      expect(mockStoreFact).toHaveBeenCalledTimes(1);
      const payload = mockStoreFact.mock.calls[0][0] as any;
      expect(payload).not.toHaveProperty('createdBy');
    });
  });
});
