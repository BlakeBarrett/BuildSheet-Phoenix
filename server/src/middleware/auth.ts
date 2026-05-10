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
 */
import { type Request, type Response, type NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';

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
    if (required) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }
    // Guest mode
    req.user = { uid: 'guest', isGuest: true };
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
    // If Firebase Admin isn't initialized (dev mode), allow through as guest
    if (err.code === 'app/no-app') {
      console.warn('[Auth] Firebase Admin not initialized — allowing as guest');
      req.user = { uid: 'dev-user', email: 'dev@localhost', isGuest: false };
      next();
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
