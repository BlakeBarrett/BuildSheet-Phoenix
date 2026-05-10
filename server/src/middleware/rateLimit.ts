/**
 * Rate limiting middleware — per-user limits based on subscription tier.
 *
 * Uses the UID from the auth middleware as the rate-limit key,
 * so each user gets their own bucket.
 */
import rateLimit from 'express-rate-limit';
import { type Request } from 'express';

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
