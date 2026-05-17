/**
 * Project CRUD routes — server-side Firestore project management.
 * Replaces direct client-side Firestore access for project persistence.
 */
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimit } from '../middleware/rateLimit.js';
import { getFirestore } from 'firebase-admin/firestore';

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

/**
 * Sanitize image array for Firestore storage.
 * Keeps only images that have been uploaded to Firebase Storage (have a storageUrl).
 * Strips base64 data URLs — they are too large for Firestore and device-local anyway.
 */
function sanitizeImages(images: any[]): any[] {
  if (!Array.isArray(images)) return [];
  return images
    .filter((img: any) => img && typeof img.storageUrl === 'string' && img.storageUrl)
    .map((img: any) => ({
      id: img.id || '',
      url: img.storageUrl, // HTTPS URL only — never base64
      storageUrl: img.storageUrl,
      storagePath: img.storagePath || null,
      prompt: img.prompt || '',
      timestamp: img.timestamp || new Date().toISOString(),
    }));
}

/**
 * GET /api/v1/projects — List all projects for the authenticated user.
 */
projectsRouter.get('/', async (req: Request, res: Response) => {
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
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/projects/:id — Get a single project by ID.
 */
projectsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const col = getProjectsCollection(req.user!.uid);
    const doc = await col.doc(param(req, "id")).get();
    if (!doc.exists) { res.status(404).json({ error: 'Project not found' }); return; }
    res.json({ project: { id: doc.id, ...doc.data() } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/v1/projects/:id — Create or update a project.
 * Body: full project session object
 */
projectsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const col = getProjectsCollection(req.user!.uid);
    const session = req.body;
    // Ensure the project belongs to this user
    session.ownerId = req.user!.uid;
    session.lastModified = new Date().toISOString();
    // Keep only Firebase Storage-backed images (strip base64 blobs)
    session.generatedImages = sanitizeImages(session.generatedImages);
    await col.doc(param(req, "id")).set(session, { merge: true });
    res.json({ ok: true, id: param(req, "id") });
  } catch (err: any) {
    console.error('[projects] Save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/v1/projects/:id — Delete a project.
 */
projectsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const col = getProjectsCollection(req.user!.uid);
    await col.doc(param(req, "id")).delete();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/v1/projects/:id/archive — Toggle archive status.
 * Body: { archived: boolean }
 */
projectsRouter.patch('/:id/archive', async (req: Request, res: Response) => {
  try {
    const col = getProjectsCollection(req.user!.uid);
    const { archived } = req.body;
    await col.doc(param(req, "id")).update({ archived: !!archived, lastModified: new Date().toISOString() });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/projects/:id/duplicate — Duplicate a project.
 */
projectsRouter.post('/:id/duplicate', async (req: Request, res: Response) => {
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
      generatedImages: sanitizeImages(data.generatedImages),
    };
    await col.doc(newId).set(newProject);
    res.json({ ok: true, id: newId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/projects/migrate — Bulk import projects from client localStorage.
 * Body: { projects: SessionObject[] }
 */
projectsRouter.post('/migrate', async (req: Request, res: Response) => {
  try {
    const col = getProjectsCollection(req.user!.uid);
    const { projects } = req.body;
    if (!Array.isArray(projects)) { res.status(400).json({ error: 'projects array is required' }); return; }

    let migrated = 0;
    for (const session of projects) {
      session.ownerId = req.user!.uid;
      session.generatedImages = sanitizeImages(session.generatedImages);
      await col.doc(session.id).set(session, { merge: true });
      migrated++;
    }
    res.json({ ok: true, migrated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
