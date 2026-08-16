/**
 * Rate limiting middleware — per-user limits based on subscription tier.
 *
 * Uses the UID from the auth middleware as the rate-limit key,
 * so each user gets their own bucket.
 */
import rateLimit from 'express-rate-limit';
import { type Request, type Response, type NextFunction } from 'express';

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
  keyGenerator: (req: Request) => {
    // Use authenticated UID if available, otherwise fall back to IP
    return req.user?.uid || req.ip || 'unknown';
  },
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
  keyGenerator: (req: Request) => {
    return req.user?.uid || req.ip || 'unknown';
  },
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
  keyGenerator: (req: Request) => {
    return req.user?.uid || req.ip || 'unknown';
  },
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
// ---------------------------------------------------------------------------

const DAILY_SEARCH_QUOTA = Number(process.env.GOOGLE_SEARCH_DAILY_QUOTA || 150);
const dailyWindowMs = 24 * 60 * 60 * 1000;
const searchUsage = new Map<string, { day: number; count: number }>();

function currentDay(): number {
  return Math.floor(Date.now() / dailyWindowMs);
}

export const searchQuota = (req: Request, res: Response, next: NextFunction): void => {
  const id = req.user?.uid || req.ip || 'unknown';
  const day = currentDay();
  const usage = searchUsage.get(id);

  if (!usage || usage.day !== day) {
    searchUsage.set(id, { day, count: 1 });
    next();
    return;
  }

  if (usage.count >= DAILY_SEARCH_QUOTA) {
    res.status(429).json({
      error: 'Daily search quota exceeded — please try again tomorrow.',
      retryAfterMs: -1,
    });
    return;
  }

  usage.count += 1;
  next();
};
