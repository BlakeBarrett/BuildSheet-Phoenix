/**
 * Daily search quota middleware test suite.
 *
 * Validates the split gate/consume contract:
 * - `searchQuota` is a CHECK-ONLY gate: 429 when over the daily cap, but it
 *   never creates or increments a usage entry on its own.
 * - `consumeSearchQuota` materializes/charges the counter exactly once per
 *   request (idempotent via the `searchQuotaConsumed` marker) and supports
 *   multi-unit charges (batch endpoints).
 * - Stale-day entries are swept once the usage map outgrows its threshold.
 *
 * State is seeded exclusively through exported functions (consumeSearchQuota
 * / searchQuota); no private module internals are imported. For prune
 * coverage we seed stale entries by temporarily monkey-patching Date.now,
 * then verify the sweep through the public middleware path.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  searchQuota,
  consumeSearchQuota,
  _dailyUsageForTests,
  _dailyUsageSizeForTests,
} from '../middleware/rateLimit.js';

// ---------------------------------------------------------------------------
// Minimal fake req/res — just enough surface for the middleware contract.
// ---------------------------------------------------------------------------

function makeReq(opts: { user?: { uid: string } | null; ip?: string } = {}): Request {
  return {
    user: opts.user ?? undefined,
    ip: opts.ip ?? '203.0.113.42',
  } as unknown as Request;
}

function makeRes(): Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const res = {} as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('searchQuota / consumeSearchQuota', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('searchQuota (check-only gate)', () => {
    it('should reject with 429 and skip next() when over quota', () => {
      // Seed an at-cap entry purely through the public API pair: the gate
      // stashes the quota id (under quota at this point), then consuming
      // `amount >= cap` lands the counter exactly AT the daily cap — so the
      // very next gate check must reject, regardless of the configured cap.
      const seeder = makeReq({ user: { uid: 'user-over-quota' } });
      searchQuota(seeder, makeRes() as unknown as Response, vi.fn() as unknown as NextFunction);
      consumeSearchQuota(seeder as any, Number.MAX_SAFE_INTEGER);

      const req = makeReq({ user: { uid: 'user-over-quota' } });
      const res = makeRes();
      const next = vi.fn() as unknown as NextFunction;

      searchQuota(req, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('quota') }));
      expect(next).not.toHaveBeenCalled();
    });

    it('should let under-quota requests through WITHOUT creating a usage entry', () => {
      const req = makeReq({ user: { uid: 'gate-fresh-user' } });
      const res = makeRes();
      const next = vi.fn() as unknown as NextFunction;

      searchQuota(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      // Check-only: first contact never materializes a counted entry…
      expect(_dailyUsageForTests('gate-fresh-user')).toBeUndefined();
      // …but the quota id IS stashed for the downstream consume call.
      expect((req as any).searchQuotaId).toBe('gate-fresh-user');
    });

    it('should fall back to req.ip for guest requesters', () => {
      const req = makeReq({ ip: '198.51.100.77' });
      const res = makeRes();

      searchQuota(req, res as unknown as Response, vi.fn() as unknown as NextFunction);

      expect((req as any).searchQuotaId).toBe('198.51.100.77');
    });

    it('should NOT collapse guests onto the shared "guest" uid — key by IP instead', () => {
      // Regression: optionalAuth assigns EVERY unauthenticated caller
      // uid='guest'; keying on uid put all guests worldwide into one bucket.
      const guestA = makeReq({ user: undefined, ip: '198.51.100.10' });
      (guestA as any).user = { uid: 'guest', isGuest: true };
      const guestB = makeReq({ user: undefined, ip: '198.51.100.20' });
      (guestB as any).user = { uid: 'guest', isGuest: true };

      searchQuota(guestA, makeRes() as unknown as Response, vi.fn() as unknown as NextFunction);
      searchQuota(guestB, makeRes() as unknown as Response, vi.fn() as unknown as NextFunction);

      expect((guestA as any).searchQuotaId).toBe('198.51.100.10');
      expect((guestB as any).searchQuotaId).toBe('198.51.100.20');

      // And consuming against one guest does not touch the other.
      consumeSearchQuota(guestA as any);
      expect(_dailyUsageForTests('198.51.100.10')?.count).toBe(1);
      expect(_dailyUsageForTests('198.51.100.20')).toBeUndefined();
    });
  });

  describe('consumeSearchQuota', () => {
    it('should create a usage entry with count=1 on first consume', () => {
      const req = makeReq({ user: { uid: 'consume-once' } });
      searchQuota(req, makeRes() as unknown as Response, vi.fn() as unknown as NextFunction);

      consumeSearchQuota(req as any);

      const usage = _dailyUsageForTests('consume-once');
      expect(usage).toBeDefined();
      expect(usage?.count).toBe(1);
      expect(usage?.day).toBe(Math.floor(Date.now() / (24 * 60 * 60 * 1000)));
    });

    it('should be idempotent — a second consume on the same req is a no-op', () => {
      const req = makeReq({ user: { uid: 'consume-idempotent' } });
      (req as any).searchQuotaId = 'consume-idempotent';

      consumeSearchQuota(req as any);
      consumeSearchQuota(req as any); // accidental double-call must not charge twice

      expect(_dailyUsageForTests('consume-idempotent')?.count).toBe(1);
    });

    it('should respect a custom amount (batch charges)', () => {
      const req = makeReq({ user: { uid: 'consume-batch' } });
      (req as any).searchQuotaId = 'consume-batch';

      consumeSearchQuota(req as any, 3);

      expect(_dailyUsageForTests('consume-batch')?.count).toBe(3);
    });

    it('should be a no-op when the gate never ran (no quota id on req)', () => {
      const bare = {} as Request; // simulate a handler invoked without the middleware

      const before = _dailyUsageSizeForTests();
      consumeSearchQuota(bare as any);

      expect(_dailyUsageSizeForTests()).toBe(before);
    });
  });

  describe('stale-entry pruning', () => {
    it('should sweep previous-day entries once the map exceeds its threshold', () => {
      const DAY_MS = 24 * 60 * 60 * 1000;
      const realNow = Date.now;
      const startOfDayYesterday = Math.floor(realNow() / DAY_MS) * DAY_MS - DAY_MS;

      const STALE_COUNT = 1001; // USAGE_PRUNE_THRESHOLD + 1

      // Seed >1000 STALE entries through consumeSearchQuota while "today"
      // is yesterday. Ids are stashed directly (plain property write) since
      // seeding via the gate would also work but adds nothing here.
      Date.now = () => startOfDayYesterday + 12 * 60 * 60 * 1000; // noon yesterday
      try {
        for (let i = 0; i < STALE_COUNT; i++) {
          const req = { searchQuotaId: `stale-guest-${i}` } as any;
          consumeSearchQuota(req, 1);
        }
      } finally {
        Date.now = realNow;
      }
      // NOTE: once the map crosses the threshold mid-loop, the opportunistic
      // sweep fires and evicts every entry from a different day — including
      // any real-today entries created by earlier tests in this file. So the
      // post-seed size is exactly STALE_COUNT, not sizeBefore + STALE_COUNT.
      expect(_dailyUsageSizeForTests()).toBe(STALE_COUNT);

      // Trigger the sweep through the public path: the gate prunes when it
      // lets a new request through past the threshold.
      const triggerReq = makeReq({ user: { uid: 'prune-trigger' } });
      const next = vi.fn() as unknown as NextFunction;
      searchQuota(triggerReq, makeRes() as unknown as Response, next);

      // Every yesterday entry is gone; nothing else was created since the
      // mid-loop sweep already cleared today's earlier entries, and the gate
      // itself still creates nothing for the trigger request.
      expect(_dailyUsageSizeForTests()).toBe(0);
      expect(_dailyUsageForTests('stale-guest-0')).toBeUndefined();
      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
