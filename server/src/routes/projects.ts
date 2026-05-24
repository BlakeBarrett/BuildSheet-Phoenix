/**
 * Project CRUD routes — server-side Firestore project management.
 * Replaces direct client-side Firestore access for project persistence.
 */
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimit } from '../middleware/rateLimit.js';
import { getFirestore } from 'firebase-admin/firestore';
import { firebaseInitialized, firebaseErrorMessage } from '../index.js';

export const projectsRouter = Router();

// All project routes require authentication
projectsRouter.use(requireAuth);
projectsRouter.use(apiRateLimit);

/** Safely extract a string param from Express 5 (params can be string|string[]). */
function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

function getProjectsCollection(uid: string) {
  const db = getFirestore();
  return db.collection('users').doc(uid).collection('projects');
}

/** Check if Firebase Admin is available and return a 503 error if not. */
function checkFirebaseAvailable(req: Request, res: Response): boolean {
  if (firebaseInitialized) return true;
  // Explicitly test getFirestore() since initializeApp() succeeds without credentials.
  try { getFirestore(); } catch {
    const status = 503;
    const message = firebaseErrorMessage
      ? `Sync service unavailable: ${firebaseErrorMessage}`
      : 'Sync service unavailable: Server Firebase not configured. Please restart with valid credentials.';
    console.warn('[projects] Firebase Admin not available — returning 503');
    res.status(status).json({ error: message, syncUnavailable: true });
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
      ? `Sync service unavailable: ${firebaseErrorMessage}`
      : 'Cloud sync unavailable — server is restarting. Your local data is safe.';
    console.warn('[projects] Firebase credential error — returning 503:', err.message);
    res.status(503).json({ error: msg, syncUnavailable: true });
  } else {
    console.error('[projects] Server error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/v1/projects — List all projects for the authenticated user.
 */
projectsRouter.get('/', async (req: Request, res: Response) => {
  if (!checkFirebaseAvailable(req, res)) return;
  try {
    const col = getProjectsCollection(req.user!.uid);
    const snapshot = await col.orderBy('lastModified', 'desc').get();
    const projects = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || 'Untitled',
        lastModified: data.lastModified,
        preview: data.bom?.length ? `${data.bom.length} Parts` : 'Empty Draft',
        thumbnail: data.thumbnail || undefined,
        archived: data.archived || false,
        tags: data.tags || [],
        folderId: data.folderId || undefined,
      };
    });
    res.json({ projects });
  } catch (err: any) {
    console.error('[projects] List error:', err.message);
    handleFirebaseError(res, err);
  }
});

/**
 * GET /api/v1/projects/:id — Get a single project by ID.
 */
projectsRouter.get('/:id', async (req: Request, res: Response) => {
  if (!checkFirebaseAvailable(req, res)) return;
  try {
    const col = getProjectsCollection(req.user!.uid);
    const doc = await col.doc(param(req, "id")).get();
    if (!doc.exists) { res.status(404).json({ error: 'Project not found' }); return; }
    res.json({ project: { id: doc.id, ...doc.data() } });
  } catch (err: any) {
    handleFirebaseError(res, err);
  }
});

/**
 * PUT /api/v1/projects/:id — Create or update a project.
 * Body: full project session object
 */
projectsRouter.put('/:id', async (req: Request, res: Response) => {
  if (!checkFirebaseAvailable(req, res)) return;
  try {
    const col = getProjectsCollection(req.user!.uid);
    const session = req.body;
    // Ensure the project belongs to this user
    session.ownerId = req.user!.uid;
    session.lastModified = new Date().toISOString();
    // Strip large blobs — images stay in client IDB
    session.generatedImages = [];
    await col.doc(param(req, "id")).set(session, { merge: true });
    res.json({ ok: true, id: param(req, "id") });
  } catch (err: any) {
    console.error('[projects] Save error:', err.message);
    handleFirebaseError(res, err);
  }
});

/**
 * DELETE /api/v1/projects/:id — Delete a project.
 */
projectsRouter.delete('/:id', async (req: Request, res: Response) => {
  if (!checkFirebaseAvailable(req, res)) return;
  try {
    const col = getProjectsCollection(req.user!.uid);
    await col.doc(param(req, "id")).delete();
    res.json({ ok: true });
  } catch (err: any) {
    handleFirebaseError(res, err);
  }
});

/**
 * PATCH /api/v1/projects/:id/archive — Toggle archive status.
 * Body: { archived: boolean }
 */
projectsRouter.patch('/:id/archive', async (req: Request, res: Response) => {
  if (!checkFirebaseAvailable(req, res)) return;
  try {
    const col = getProjectsCollection(req.user!.uid);
    const { archived } = req.body;
    await col.doc(param(req, "id")).update({ archived: !!archived, lastModified: new Date().toISOString() });
    res.json({ ok: true });
  } catch (err: any) {
    handleFirebaseError(res, err);
  }
});

/**
 * POST /api/v1/projects/:id/duplicate — Duplicate a project.
 */
projectsRouter.post('/:id/duplicate', async (req: Request, res: Response) => {
  if (!checkFirebaseAvailable(req, res)) return;
  try {
    const col = getProjectsCollection(req.user!.uid);
    const doc = await col.doc(param(req, "id")).get();
    if (!doc.exists) { res.status(404).json({ error: 'Project not found' }); return; }

    const data = doc.data()!;
    const newId = Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    const newProject = {
      ...data,
      id: newId,
      name: `${data.name || 'Untitled'} (Copy)`,
      createdAt: now,
      lastModified: now,
      ownerId: req.user!.uid,
      generatedImages: [],
    };
    await col.doc(newId).set(newProject);
    res.json({ ok: true, id: newId });
  } catch (err: any) {
    handleFirebaseError(res, err);
  }
});

/**
 * POST /api/v1/projects/migrate — Bulk import projects from client localStorage.
 * Body: { projects: SessionObject[] }
 */
projectsRouter.post('/migrate', async (req: Request, res: Response) => {
  if (!checkFirebaseAvailable(req, res)) return;
  try {
    const col = getProjectsCollection(req.user!.uid);
    const { projects } = req.body;
    if (!Array.isArray(projects)) { res.status(400).json({ error: 'projects array is required' }); return; }

    let migrated = 0;
    for (const session of projects) {
      session.ownerId = req.user!.uid;
      session.generatedImages = [];
      await col.doc(session.id).set(session, { merge: true });
      migrated++;
    }
    res.json({ ok: true, migrated });
  } catch (err: any) {
    handleFirebaseError(res, err);
  }
});
