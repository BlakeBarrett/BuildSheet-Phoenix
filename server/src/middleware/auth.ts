/**
 * Firebase Auth middleware — verifies Firebase ID tokens.
 *
 * Extracts the Bearer token from the Authorization header,
 * verifies it via Firebase Admin SDK, and attaches the decoded
 * user info to `req.user`.
 *
 * In dev mode (no Firebase Admin configured), the middleware
 * is permissive and allows unauthenticated requests through
 * with a guest user context.
 *
 * In production the middleware fails CLOSED: a missing Firebase
 * configuration returns 503 rather than downgrading requests to a
 * shared guest/dev identity.
 */
import { type Request, type Response, type NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { isDev } from '../config.js';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  isGuest: boolean;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware that requires authentication.
 * Returns 401 if no valid token is provided.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  authenticateRequest(req, res, next, true);
}

/**
 * Middleware that allows optional authentication.
 * Sets req.user to a guest if no token is provided, but doesn't reject.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  authenticateRequest(req, res, next, false);
}

async function authenticateRequest(
  req: Request,
  res: Response,
  next: NextFunction,
  required: boolean
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    if (required && !isDev()) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }
    // Dev mode or optional auth — allow through
    req.user = isDev()
      ? { uid: 'dev-user', email: 'dev@localhost', isGuest: false }
      : { uid: 'guest', isGuest: true };
    next();
    return;
  }

  const idToken = authHeader.substring(7);

  try {
    const auth = getAuth();
    const decoded = await auth.verifyIdToken(idToken);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      isGuest: false,
    };
    next();
  } catch (err: any) {
    // Fail closed: in production, Firebase misconfiguration must NOT downgrade
    // requests to a shared guest/dev identity (cross-tenant isolation breach).
    // Only non-production environments may degrade to permissive dev mode.
    const firebaseUnavailable =
      err.code === 'app/no-app' ||
      (err.message?.includes('credentials') || err.message?.includes('Could not load the default'));

    if (firebaseUnavailable && isDev()) {
      console.warn('[Auth] Firebase unavailable — dev mode, allowing as dev-user:', err.message);
      req.user = { uid: 'dev-user', email: 'dev@localhost', isGuest: false };
      next();
      return;
    }

    if (firebaseUnavailable) {
      console.error('[Auth] Firebase unavailable in production — failing closed:', err.message);
      if (required) {
        res.status(503).json({ error: 'Authentication service unavailable. Please try again shortly.' });
        return;
      }
      res.status(503).json({ error: 'Authentication service unavailable. Please try again shortly.' });
      return;
    }

    console.error('[Auth] Token verification failed:', err.message);
    if (required) {
      res.status(401).json({ error: 'Invalid or expired authentication token' });
      return;
    }
    // Optional auth — continue as guest
    req.user = { uid: 'guest', isGuest: true };
    next();
  }
}
