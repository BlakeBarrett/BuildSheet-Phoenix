/**
 * Tests for the auth middleware — requireAuth and optionalAuth.
 *
 * Covers the dev-mode bypass added to allow unauthenticated requests
 * through in development environments (NODE_ENV !== 'production').
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(authHeader?: string): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as unknown as Request;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

describe('requireAuth', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('returns 401 in production when no auth header is present', async () => {
    process.env.NODE_ENV = 'production';
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await (requireAuth as any)(req, res, next);

    expect((res.status as any).mock.calls[0][0]).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows through as dev-user in dev mode when no auth header is present', async () => {
    process.env.NODE_ENV = 'development';
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await (requireAuth as any)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).user).toMatchObject({ uid: 'dev-user', isGuest: false });
  });

  it('allows through as dev-user when NODE_ENV is not set', async () => {
    delete process.env.NODE_ENV;
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await (requireAuth as any)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).user?.isGuest).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fail-closed when Firebase is unavailable (production misconfiguration)
// ---------------------------------------------------------------------------

describe('auth when Firebase is unavailable', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('requireAuth returns 503 in production on app/no-app (never downgrade to dev-user)', async () => {
    process.env.NODE_ENV = 'production';
    verifyIdToken.mockRejectedValue(Object.assign(new Error('no default app'), { code: 'app/no-app' }));

    const req = makeReq('Bearer some-token');
    const res = makeRes();
    const next = vi.fn();

    await (requireAuth as any)(req, res, next);

    expect((res.status as any).mock.calls[0][0]).toBe(503);
    expect(next).not.toHaveBeenCalled();
    expect((req as any).user).toBeUndefined();
  });

  it('optionalAuth returns 503 in production when credentials are missing (token was presented)', async () => {
    process.env.NODE_ENV = 'production';
    verifyIdToken.mockRejectedValue(new Error('Could not load the default credentials'));

    const req = makeReq('Bearer some-token');
    const res = makeRes();
    const next = vi.fn();

    await (optionalAuth as any)(req, res, next);

    expect((res.status as any).mock.calls[0][0]).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('still allows dev-mode passthrough on app/no-app (developer convenience preserved)', async () => {
    process.env.NODE_ENV = 'development';
    verifyIdToken.mockRejectedValue(Object.assign(new Error('no default app'), { code: 'app/no-app' }));

    const req = makeReq('Bearer some-token');
    const res = makeRes();
    const next = vi.fn();

    await (requireAuth as any)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).user).toMatchObject({ uid: 'dev-user', isGuest: false });
  });

  it('invalid token with optionalAuth still continues as guest (unauthenticated-equivalent)', async () => {
    process.env.NODE_ENV = 'production';
    verifyIdToken.mockRejectedValue(new Error('ID token expired'));

    const req = makeReq('Bearer bad-token');
    const res = makeRes();
    const next = vi.fn();

    await (optionalAuth as any)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).user).toMatchObject({ uid: 'guest', isGuest: true });
  });

  it('valid token still authenticates normally in production', async () => {
    process.env.NODE_ENV = 'production';
    verifyIdToken.mockResolvedValue({ uid: 'real-user', email: 'r@x.co' });

    const req = makeReq('Bearer good-token');
    const res = makeRes();
    const next = vi.fn();

    await (requireAuth as any)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).user).toMatchObject({ uid: 'real-user', isGuest: false });
  });
});

// ---------------------------------------------------------------------------
// optionalAuth
// ---------------------------------------------------------------------------

describe('optionalAuth', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('allows through as guest in production when no auth header is present', async () => {
    process.env.NODE_ENV = 'production';
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await (optionalAuth as any)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).user).toMatchObject({ uid: 'guest', isGuest: true });
  });

  it('allows through as dev-user in dev mode when no auth header is present', async () => {
    process.env.NODE_ENV = 'development';
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await (optionalAuth as any)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).user).toMatchObject({ uid: 'dev-user', isGuest: false });
  });
});
