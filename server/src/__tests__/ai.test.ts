/**
 * Tests for the AI proxy route hardening (S1).
 *
 * Verifies server-side model allowlisting, max_tokens clamping, and request
 * validation so an authenticated caller cannot burn unbounded/arbitrary model
 * budgets through the proxy.
 *
 * Env vars are set in the module body BEFORE dynamically importing the router
 * (ALLOWED_MODELS/MAX_TOKENS are computed at module load). The real fetch is
 * captured so the mock only intercepts the upstream provider call, not the
 * test's own requests to the local test server.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

process.env.AI_KEY = 'test-key';
process.env.AI_BASE_URL = 'https://provider.test/v1';
process.env.AI_MODEL_FAST = 'fast-model';
process.env.AI_MODEL_SMART = 'smart-model';
process.env.AI_MODEL_STRUCTURED = 'structured-model';

let aiRouter: any;
let realFetch: typeof globalThis.fetch;

beforeAll(async () => {
  realFetch = globalThis.fetch;
  ({ default: aiRouter } = await import('../routes/ai.js'));
});

// ---------------------------------------------------------------------------
// Test app + fetch helpers
// ---------------------------------------------------------------------------

let server: Server | null = null;

async function startApp(): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use(aiRouter);
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const addr = server!.address() as any;
      resolve(`http://localhost:${addr.port}`);
    });
  });
}

afterEach(async () => {
  await new Promise<void>((r) => server?.close(() => r()));
  server = null;
  vi.unstubAllGlobals();
});

/** Mock the upstream provider fetch (NOT the local test server). */
function mockProvider(overrides: Partial<Response> = {}): ReturnType<typeof vi.fn> {
  const mock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    text: async () => '',
    ...overrides,
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

function clientFetch(base: string, path: string, body: unknown): Promise<Response> {
  return realFetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /chat', () => {
  it('rejects non-array messages', async () => {
    const base = await startApp();
    const fetchMock = mockProvider();
    const res = await clientFetch(base, '/chat', { messages: 'not-an-array' });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a model that is not in the allowlist', async () => {
    const base = await startApp();
    const fetchMock = mockProvider();
    const res = await clientFetch(base, '/chat', { messages: [{ role: 'user', content: 'hi' }], model: 'expensive-model' });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clamps oversized max_tokens', async () => {
    const base = await startApp();
    const fetchMock = mockProvider();
    const res = await clientFetch(base, '/chat', { messages: [{ role: 'user', content: 'hi' }], model: 'fast-model', max_tokens: 99999999 });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards a valid request to the provider with default model', async () => {
    const base = await startApp();
    const fetchMock = mockProvider();
    const res = await clientFetch(base, '/chat', { messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(200);
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toContain('/chat/completions');
    const payload = JSON.parse(call[1].body);
    expect(payload.model).toBe('fast-model');
    expect(payload.max_tokens).toBeGreaterThan(0);
    expect(payload.max_tokens).toBeLessThanOrEqual(32768);
  });

  it('returns 500 when AI_KEY is not configured', async () => {
    const saved = process.env.AI_KEY;
    process.env.AI_KEY = '';
    const base = await startApp();
    mockProvider();
    const res = await clientFetch(base, '/chat', { messages: [{ role: 'user', content: 'hi' }], model: 'fast-model' });
    expect(res.status).toBe(500);
    process.env.AI_KEY = saved;
  });
});

describe('POST /generate-structured', () => {
  it('rejects non-array messages', async () => {
    const base = await startApp();
    const fetchMock = mockProvider();
    const res = await clientFetch(base, '/generate-structured', { messages: 'nope' });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a disallowed model', async () => {
    const base = await startApp();
    const fetchMock = mockProvider();
    const res = await clientFetch(base, '/generate-structured', { messages: [{ role: 'user', content: 'json please' }], model: 'not-allowed' });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards a valid structured request with json_object response format', async () => {
    const base = await startApp();
    const fetchMock = mockProvider();
    const res = await clientFetch(base, '/generate-structured', { messages: [{ role: 'user', content: 'json please' }], model: 'structured-model' });
    expect(res.status).toBe(200);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.response_format?.type).toBe('json_object');
    expect(payload.model).toBe('structured-model');
  });
});
