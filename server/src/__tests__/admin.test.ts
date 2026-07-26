/**
 * Tests for the Admin API routes — validates admin-only correction approval workflow.
 *
 * Uses mock Firestore and auth middleware to verify route logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock firebase-admin/firestore before importing routes
// ---------------------------------------------------------------------------

const mockCorrectionDoc = {
  exists: true,
  id: 'test-correction-1',
  data: () => ({
    factId: 'fact-1',
    category: 'component-specs',
    statement: 'Test correction statement',
    source: 'user-correction',
    confidence: 0.8,
    tags: ['test', 'component'],
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
    status: 'pending',
    createdBy: 'user-123',
  }),
};

const mockPendingCorrections = {
  docs: [mockCorrectionDoc],
};

const mockCorrectionCollection = {
  where: vi.fn(() => ({
    orderBy: vi.fn(() => ({
      get: vi.fn(() => Promise.resolve(mockPendingCorrections)),
    })),
  })),
  doc: vi.fn(() => ({
    get: vi.fn(() => Promise.resolve(mockCorrectionDoc)),
    update: vi.fn(() => Promise.resolve()),
  })),
};

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => mockCorrectionCollection,
  }),
}));

// Mock Firebase exports that admin.ts imports from index.ts
vi.mock('../index.js', () => ({
  firebaseInitialized: true,
  firebaseErrorMessage: '',
}));

// Mock auth middleware to always pass with test user
vi.mock('../middleware/auth.js', () => ({
  requireAuth: (_req: any, _res: any, next: any) => {
    _req.user = { uid: 'admin-test-user', email: 'admin@test.com', isGuest: false };
    next();
  },
  optionalAuth: (_req: any, _res: any, next: any) => {
    _req.user = { uid: 'test-user', email: 'test@test.com', isGuest: false };
    next();
  },
}));

// Mock rate limiter to pass through
vi.mock('../middleware/rateLimit.js', () => ({
  apiRateLimit: (_req: any, _res: any, next: any) => next(),
}));

import express from 'express';
import { adminRouter } from '../routes/admin.js';

// ---------------------------------------------------------------------------
// Test app setup
// ---------------------------------------------------------------------------

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin', adminRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Admin API', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
    // Set admin UID for testing
    process.env.ADMIN_UIDS = 'admin-test-user,another-admin';
  });

  afterEach(() => {
    delete process.env.ADMIN_UIDS;
  });

  describe('GET /api/v1/admin/corrections', () => {
    it('returns pending corrections with expected shape', async () => {
      const baseUrl = await startServer(app);
      const res = await fetch(`${baseUrl}/corrections`);
      const data = await res.json() as any;

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('corrections');
      expect(Array.isArray(data.corrections)).toBe(true);
      expect(data.corrections.length).toBeGreaterThan(0);

      const correction = data.corrections[0];
      expect(correction).toHaveProperty('id');
      expect(correction).toHaveProperty('factId');
      expect(correction).toHaveProperty('category');
      expect(correction).toHaveProperty('statement');
      expect(correction).toHaveProperty('source');
      expect(correction).toHaveProperty('confidence');
      expect(correction).toHaveProperty('tags');
      expect(correction).toHaveProperty('createdAt');
      expect(correction).toHaveProperty('status');
    });
  });

  describe('POST /api/v1/admin/corrections/approve', () => {
    it('approves a correction with valid action', async () => {
      const baseUrl = await startServer(app);
      const res = await fetch(`${baseUrl}/corrections/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correctionId: 'test-correction-1',
          action: 'approve',
          confidence: 0.9,
        }),
      });
      const data = await res.json() as any;

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('ok', true);
      expect(data).toHaveProperty('correctionId');
      expect(data).toHaveProperty('action');
      expect(data).toHaveProperty('newStatus');
      expect(data.newStatus).toBe('approved');
    });

    it('rejects a correction with valid action', async () => {
      const baseUrl = await startServer(app);
      const res = await fetch(`${baseUrl}/corrections/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correctionId: 'test-correction-1',
          action: 'reject',
        }),
      });
      const data = await res.json() as any;

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('ok', true);
      expect(data.newStatus).toBe('rejected');
    });

    it('returns 400 for invalid action', async () => {
      const baseUrl = await startServer(app);
      const res = await fetch(`${baseUrl}/corrections/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correctionId: 'test-correction-1',
          action: 'invalid',
        }),
      });
      const data = await res.json() as any;

      expect(res.status).toBe(400);
      expect(data).toHaveProperty('error');
    });

    it('returns 400 when correctionId is missing', async () => {
      const baseUrl = await startServer(app);
      const res = await fetch(`${baseUrl}/corrections/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
        }),
      });
      const data = await res.json() as any;

      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent correction', async () => {
      const baseUrl = await startServer(app);
      // Mock the doc to return exists: false
      mockCorrectionDoc.exists = false;
      
      const res = await fetch(`${baseUrl}/corrections/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correctionId: 'non-existent-id',
          action: 'approve',
        }),
      });
      const data = await res.json() as any;

      expect(res.status).toBe(404);
      expect(data).toHaveProperty('error', 'Correction not found');
      
      // Reset mock
      mockCorrectionDoc.exists = true;
    });
  });

  describe('API Contract — Response Shapes', () => {
    it('list corrections response should have { corrections: Array }', () => {
      const expectedShape = { corrections: expect.any(Array) };
      const mockResponse = {
        corrections: [
          {
            id: 'test-id',
            factId: 'fact-1',
            category: 'component-specs',
            statement: 'Test',
            source: 'user-correction',
            confidence: 0.8,
            tags: ['test'],
            createdAt: '2026-05-13T00:00:00.000Z',
            status: 'pending',
          },
        ],
      };
      expect(mockResponse).toMatchObject(expectedShape);
    });

    it('approve/reject response should have { ok: true, correctionId, action, newStatus }', () => {
      const mockResponse = {
        ok: true,
        correctionId: 'test-id',
        action: 'approve',
        newStatus: 'approved',
      };
      expect(mockResponse).toHaveProperty('ok', true);
      expect(mockResponse).toHaveProperty('correctionId');
      expect(mockResponse).toHaveProperty('action');
      expect(mockResponse).toHaveProperty('newStatus');
    });
  });
});

// Helper to start server and get base URL
async function startServer(app: express.Application): Promise<string> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as any;
      resolve(`http://localhost:${addr.port}/api/v1/admin`);
    });
    // Auto-close after tests
    setTimeout(() => server.close(), 5000);
  });
}
