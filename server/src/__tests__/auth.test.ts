/**
 * Tests for the auth middleware — requireAuth and optionalAuth.
 *
 * Covers the dev-mode bypass added to allow unauthenticated requests
 * through in development environments (NODE_ENV !== 'production').
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
