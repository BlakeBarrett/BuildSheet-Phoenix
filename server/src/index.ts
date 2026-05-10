import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

import { architectRouter } from './routes/architect.js';
import { sourcingRouter } from './routes/sourcing.js';
import { generationRouter } from './routes/generation.js';
import { projectsRouter } from './routes/projects.js';
import { createAiService } from './services/aiServiceFactory.js';
import { requestLogger } from './middleware/logger.js';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
dotenv.config({ path: '../.env' });

const PORT = parseInt(process.env.PORT || '8081', 10);
const isDev = process.env.NODE_ENV !== 'production';

// ---------------------------------------------------------------------------
// Firebase Admin — initialize once
// ---------------------------------------------------------------------------
const firebaseProjectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;

if (firebaseProjectId) {
  try {
    // In production, use Application Default Credentials (Cloud Run injects these).
    // In dev, set GOOGLE_APPLICATION_CREDENTIALS env var or use gcloud auth.
    initializeApp({
      projectId: firebaseProjectId,
    });
    console.log(`[Server] Firebase Admin initialized (project: ${firebaseProjectId})`);
  } catch (err) {
    console.warn('[Server] Firebase Admin init failed — auth middleware will skip token verification:', err);
  }
} else {
  console.warn('[Server] No Firebase project ID found — auth middleware will run in permissive mode');
}

// ---------------------------------------------------------------------------
// AI Service — create once, share across routes
// ---------------------------------------------------------------------------
const aiService = createAiService();
console.log(`[Server] AI Service: ${aiService.name} (offline=${aiService.isOffline})`);

// ---------------------------------------------------------------------------
// Express App
// ---------------------------------------------------------------------------
const app = express();

// Security headers
app.use(helmet({
  // Allow the SPA to load assets; adjust as needed
  contentSecurityPolicy: false,
}));

// CORS — in production nginx handles this; in dev we need it for Vite proxy
// Request logger — first to catch all requests and add request ID
app.use(requestLogger);
app.use(cors({
  origin: isDev ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : false,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' })); // images can be large base64

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------
app.get('/api/v1/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: aiService.name,
    offline: aiService.isOffline,
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

// Attach the AI service to the request for route handlers
app.use('/api/v1', (req, _res, next) => {
  (req as any).aiService = aiService;
  next();
});

app.use('/api/v1/architect', architectRouter);
app.use('/api/v1/sourcing', sourcingRouter);
app.use('/api/v1/generate', generationRouter);
app.use('/api/v1/projects', projectsRouter);

// ---------------------------------------------------------------------------
// Error Handler
// ---------------------------------------------------------------------------
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Unhandled error:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: isDev ? err.message : 'Internal server error',
    ...(isDev && { stack: err.stack }),
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] BuildSheet API server listening on port ${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/api/v1/health`);
});

export default app;
