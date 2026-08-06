/**
 * Tests for the auth middleware — requireAuth and optionalAuth.
 *
 * Production MUST fail closed: Firebase misconfiguration returns 503 rather
 * than downgrading requests to a shared guest/dev identity. Dev mode may pass
 * unauthenticated requests through with a dev-user context.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

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

function makeFirebaseError(code?: string, message?: string): Error {
  const e = new Error(message || 'boom') as any;
  if (code) e.code = code;
  return e;
}

// Force the Firebase Admin getAuth to throw a controlled error.
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: vi.fn().mockRejectedValue(makeFirebaseError('app/no-app')),
  }),
}));

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

describe('requireAuth', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalServerEnv = process.env.SERVER_NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.SERVER_NODE_ENV = originalServerEnv;
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

  it('FAILS CLOSED (503) in production when Firebase is unavailable (app/no-app)', async () => {
    process.env.NODE_ENV = 'production';
    const req = makeReq('Bearer invalid-token');
    const res = makeRes();
    const next = vi.fn();

    await (requireAuth as any)(req, res, next);

    expect((res.status as any).mock.calls[0][0]).toBe(503);
    expect(next).not.toHaveBeenCalled();
    expect((req as any).user).toBeUndefined();
  });

  it('FAILS CLOSED (503) when SERVER_NODE_ENV=production and NODE_ENV unset', async () => {
    delete process.env.NODE_ENV;
    process.env.SERVER_NODE_ENV = 'production';
    const req = makeReq('Bearer invalid-token');
    const res = makeRes();
    const next = vi.fn();

    await (requireAuth as any)(req, res, next);

    expect((res.status as any).mock.calls[0][0]).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows dev mode when Firebase unavailable (credentials error)', async () => {
    process.env.NODE_ENV = 'development';
    const req = makeReq('Bearer invalid-token');
    const res = makeRes();
    const next = vi.fn();

    await (requireAuth as any)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).user?.isGuest).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// optionalAuth
// ---------------------------------------------------------------------------

describe('optionalAuth', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalServerEnv = process.env.SERVER_NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.SERVER_NODE_ENV = originalServerEnv;
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

  it('FAILS CLOSED (503) for optional routes in production when Firebase is unavailable', async () => {
    process.env.NODE_ENV = 'production';
    const req = makeReq('Bearer invalid-token');
    const res = makeRes();
    const next = vi.fn();

    await (optionalAuth as any)(req, res, next);

    expect((res.status as any).mock.calls[0][0]).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });
});
