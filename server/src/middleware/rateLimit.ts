/**
 * Rate limiting middleware — per-user limits based on subscription tier.
 *
 * Uses the UID from the auth middleware as the rate-limit key,
 * so each user gets their own bucket.
 */
import rateLimit from 'express-rate-limit';
import { type Request, type Response, type NextFunction } from 'express';

/**
 * Stable per-requester identity for limiters/quota maps.
 *
 * IMPORTANT: guests must NOT collapse onto a single key. `optionalAuth`
 * assigns every unauthenticated caller uid 'guest' — keying on that would
 * put all guests on Earth into one shared bucket (one abusive guest could
 * exhaust everyone's budget). Guests are isolated by client IP instead;
 * only verified users key on their uid.
 */
export function requesterId(req: Request): string {
  if (req.user && !req.user.isGuest) return req.user.uid;
  return req.ip || 'unknown';
}

/**
 * Creates a rate limiter for API routes.
 * Free users: 30 requests per minute
 * Authenticated users: 120 requests per minute
 * (Tier-specific limits can be refined later via TierService integration)
 */
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: (req: Request) => {
    // Guest/unauthenticated users get a tighter limit
    if (!req.user || req.user.isGuest) return 30;
    // Authenticated users get a generous limit
    return 120;
  },
  keyGenerator: (req: Request) => requesterId(req),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many requests — please slow down.',
    retryAfterMs: 60000,
  },
});

/**
 * Stricter rate limiter for expensive AI generation endpoints.
 * Free: 10/min, Authenticated: 30/min
 */
export const generationRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: (req: Request) => {
    if (!req.user || req.user.isGuest) return 10;
    return 30;
  },
  keyGenerator: (req: Request) => requesterId(req),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Generation rate limit exceeded — please wait before trying again.',
    retryAfterMs: 60000,
  },
});

/**
 * Tighter rate limiter for Google Search grounding endpoints.
 * These calls hit Google's web search and are the most likely to trigger
 * API-key throttling/blacklisting when fired in bursts.
 * Free: 5/min, Authenticated: 20/min
 */
export const searchRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: (req: Request) => {
    if (!req.user || req.user.isGuest) return 5;
    return 20;
  },
  keyGenerator: (req: Request) => requesterId(req),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Search rate limit exceeded — please wait a moment before trying again.',
    retryAfterMs: 60000,
  },
});

// ---------------------------------------------------------------------------
// Daily search quota — a hard per-user cap on Google Search grounding calls.
// Resets at midnight. In-memory (resets on restart); a Firestore-backed
// counter can replace this if the server runs as multiple replicas.
//
// Split into two halves so cache-served requests are free:
//   1. `searchQuota` middleware is a CHECK-ONLY gate. It rejects requests that
//      are already over quota but never increments the counter — the counter
//      is only bumped by `consumeSearchQuota()`.
//   2. Route handlers call `consumeSearchQuota(req)` AFTER grounding actually
//      ran (i.e., the response was NOT served from the SearchService TTL
//      cache and the kill-switch did not short-circuit). Cache hits therefore
//      never burn daily quota.
// ---------------------------------------------------------------------------

const DAILY_SEARCH_QUOTA = Number(process.env.GOOGLE_SEARCH_DAILY_QUOTA || 150);
const dailyWindowMs = 24 * 60 * 60 * 1000;
// Opportunistic cleanup: once the usage map grows past this many entries
// (long-tail guest IPs, mostly), sweep out entries from previous days.
const USAGE_PRUNE_THRESHOLD = 1000;
const searchUsage = new Map<string, { day: number; count: number }>();

function currentDay(): number {
  return Math.floor(Date.now() / dailyWindowMs);
}

/** Deletes usage entries belonging to a previous day (no-op below threshold). */
function pruneStaleUsage(): void {
  if (searchUsage.size <= USAGE_PRUNE_THRESHOLD) return;
  const day = currentDay();
  for (const [id, usage] of searchUsage) {
    if (usage.day !== day) searchUsage.delete(id);
  }
}

/**
 * Check-only gate for the daily search quota. Rejects with 429 when the
 * requester has already burned their daily grounding budget; otherwise
 * stashes the quota id on the request for the matching `consumeSearchQuota()`
 * call downstream and lets the request through WITHOUT counting it.
 */
export const searchQuota = (req: Request, res: Response, next: NextFunction): void => {
  const id = requesterId(req);
  const day = currentDay();
  const usage = searchUsage.get(id);

  if (usage && usage.day === day && usage.count >= DAILY_SEARCH_QUOTA) {
    res.status(429).json({
      error: 'Daily search quota exceeded — please try again tomorrow.',
      retryAfterMs: -1,
    });
    return;
  }

  pruneStaleUsage();

  // First-ever requests create NO counted entry here — the counter only
  // materializes when grounding actually happens (see consumeSearchQuota).
  (req as any).searchQuotaId = id;
  next();
};

/**
 * Charge grounding spend against the requester's daily search quota.
 * Call once per fully-handled request, AFTER input validation passes and only
 * for responses that required real grounding (not cache hits).
 *
 * `amount` lets the batch endpoint charge several fresh queries via a single
 * call. Repeat invocations for the same request are ignored (idempotent via
 * the `searchQuotaConsumed` marker), so accidental double-calls stay honest.
 */
export function consumeSearchQuota(req: Request, amount = 1): void {
  const reqAny = req as any;
  if (!reqAny.searchQuotaId || reqAny.searchQuotaConsumed || amount <= 0) return;
  reqAny.searchQuotaConsumed = true;

  const id: string = reqAny.searchQuotaId;
  const day = currentDay();
  const usage = searchUsage.get(id);

  if (!usage || usage.day !== day) {
    searchUsage.set(id, { day, count: Math.min(amount, DAILY_SEARCH_QUOTA) });
  } else {
    usage.count += amount;
  }

  pruneStaleUsage();
}

// --- Test-only visibility into the usage map (pure reads; do not abuse) ----

/** @internal Exposed for unit tests: number of ids currently tracked. */
export function _dailyUsageSizeForTests(): number {
  return searchUsage.size;
}

/** @internal Exposed for unit tests: a single id's usage entry, if any. */
export function _dailyUsageForTests(id: string): { day: number; count: number } | undefined {
  return searchUsage.get(id);
}
