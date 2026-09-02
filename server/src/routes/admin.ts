/**
 * Admin routes — admin-only endpoints for reviewing and approving user corrections.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimit } from '../middleware/rateLimit.js';
import { getFirestore } from 'firebase-admin/firestore';
import { firebaseInitialized, firebaseErrorMessage } from '../index.js';

export const adminRouter = Router();

/** Check if the user is an admin based on configured admin UIDs. */
function isAdmin(uid: string): boolean {
  const adminUids = process.env.ADMIN_UIDS?.split(',').map(s => s.trim()).filter(Boolean) || [];
  return adminUids.includes(uid);
}

/** Middleware that requires admin access. */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.uid) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!isAdmin(req.user.uid)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

/** Check if Firebase Admin is available and return a 503 error if not. */
function checkFirebaseAvailable(req: Request, res: Response): boolean {
  if (firebaseInitialized) return true;
  try { getFirestore(); } catch {
    const status = 503;
    const message = firebaseErrorMessage
      ? `Admin service unavailable: ${firebaseErrorMessage}`
      : 'Admin service unavailable: Server Firebase not configured.';
    console.warn('[admin] Firebase Admin not available — returning 503');
    res.status(status).json({ error: message, serviceUnavailable: true });
    return false;
  }
  return true;
}

/** Return 503 for Firebase credential errors, 500 for everything else. */
function handleFirebaseError(res: Response, err: any): void {
  const isCredError = err.message
    && (err.message.includes('credentials')
      || err.message.includes('Could not load the default')
      || err.message.includes('Failed to connect to Firestore'));
  if (isCredError) {
    const msg = firebaseErrorMessage
      ? `Admin service unavailable: ${firebaseErrorMessage}`
      : 'Admin service unavailable: Server Firebase credentials error.';
    console.warn('[admin] Firebase credential error — returning 503:', err.message);
    res.status(503).json({ error: msg, serviceUnavailable: true });
  } else {
    console.error('[admin] Server error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// All admin routes require authentication, admin access, and a base rate limit.
// Admin endpoints also authorize on every request, so applying apiRateLimit here
// satisfies CodeQL's "auth route must be rate-limited" rule. Listing/small
// mutations are not search-budget operations, so searchRateLimit is unnecessary.
adminRouter.use(requireAuth);
adminRouter.use(apiRateLimit);
adminRouter.use(requireAdmin);

/**
 * GET /api/v1/admin/corrections — List pending corrections.
 * Returns corrections with status 'pending'.
 */
adminRouter.get('/corrections', async (req: Request, res: Response) => {
  if (!checkFirebaseAvailable(req, res)) return;

  try {
    const db = getFirestore();
    const correctionsRef = db.collection('verified_facts');

    // Fetch pending corrections. NOTE: equality + orderBy would require a
    // composite index that isn't provisioned — filter server-side, sort in
    // memory (pending volume is small and bounded).
    const snapshot = await correctionsRef
      .where('status', '==', 'pending')
      .get();

    // Firestore returns Timestamp objects for Date fields; the admin UI
    // expects ISO strings (`new Date(correction.createdAt)` on a raw
    // Timestamp renders "Invalid Date"). Serialize before responding.
    const toIso = (v: any): string => {
      if (!v) return '';
      if (typeof v === 'string') return v;
      if (typeof v?.toDate === 'function') return v.toDate().toISOString();
      if (typeof v === 'number') return new Date(v).toISOString();
      return String(v);
    };

    const corrections = snapshot.docs
      .map(doc => {
        const data = doc.data() as Record<string, any>;
        return {
          id: doc.id,
          ...data,
          createdAt: toIso(data.createdAt),
          updatedAt: toIso(data.updatedAt),
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    res.json({ corrections });
  } catch (err: any) {
    console.error('[admin] List corrections error:', err.message);
    handleFirebaseError(res, err);
  }
});

/**
 * POST /api/v1/admin/corrections/approve — Approve or reject a correction.
 * Body: { correctionId: string, action: 'approve' | 'reject', confidence?: number }
 */
adminRouter.post('/corrections/approve', async (req: Request, res: Response) => {
  if (!checkFirebaseAvailable(req, res)) return;

  try {
    const { correctionId, action, confidence } = req.body;

    if (!correctionId || !action || !['approve', 'reject'].includes(action)) {
      res.status(400).json({ error: 'Invalid request: correctionId and action (approve/reject) required' });
      return;
    }

    const db = getFirestore();
    const correctionRef = db.collection('verified_facts').doc(correctionId);
    const correctionDoc = await correctionRef.get();

    if (!correctionDoc.exists) {
      res.status(404).json({ error: 'Correction not found' });
      return;
    }

    // Use a Firestore Timestamp consistently with VerifiedFactService so the
    // updatedAt field has the same type regardless of which path last wrote it.
    const now = new Date();
    const updates: any = {
      status: action === 'approve' ? 'approved' : 'rejected',
      updatedAt: now,
      approvedBy: req.user!.uid,
    };

    // Update confidence if provided and action is approve
    if (action === 'approve' && typeof confidence === 'number') {
      updates.confidence = Math.max(0, Math.min(1, confidence)); // Clamp to 0-1
    }

    await correctionRef.update(updates);

    res.json({ 
      ok: true, 
      correctionId, 
      action,
      newStatus: updates.status 
    });
  } catch (err: any) {
    console.error('[admin] Approve/reject correction error:', err.message);
    handleFirebaseError(res, err);
  }
});
