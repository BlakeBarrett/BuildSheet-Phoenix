import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

import { architectRouter } from './routes/architect.js';
import { sourcingRouter } from './routes/sourcing.js';
import { generationRouter } from './routes/generation.js';
import { projectsRouter } from './routes/projects.js';
import { sharesRouter, sharePageRouter } from './routes/shares.js';
import aiRouter from './routes/ai.js';
import { adminRouter } from './routes/admin.js';
import { createAiService } from './services/aiServiceFactory.js';
import { requestLogger } from './middleware/logger.js';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
dotenv.config({ path: '../.env' });

// PORT is forced to 8081 by env.sh at startup.
// Cloud Run injects PORT=8080 for nginx (the public port); env.sh overrides it
// to 8081 before spawning this process so there is never a conflict.
const PORT = parseInt(process.env.PORT || '8081', 10);
const isDev = process.env.NODE_ENV !== 'production';

// ---------------------------------------------------------------------------
// Firebase Admin — initialize with proper credentials handling
// ---------------------------------------------------------------------------
const firebaseProjectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

let firebaseInitialized = false;
let firebaseErrorMessage = '';

if (!firebaseProjectId) {
  firebaseErrorMessage = 'No Firebase project ID configured';
  console.error('[Server] CRITICAL: No Firebase project ID found (check VITE_FIREBASE_PROJECT_ID or .env). Firebase features will fail.');
} else {
  try {
    let appConfig: any = { projectId: firebaseProjectId };

    if (credentialsPath) {
      // Production: load from mounted secrets file (Cloud Run / K8s)
      appConfig.credential = cert(credentialsPath);
      console.log(`[Server] Firebase Admin: Using credentials file at ${credentialsPath}`);
    } else {
      // Dev: use Application Default Credentials (ADC) — gcloud CLI or GCP metadata server
      console.log('[Server] Firebase Admin: Using Application Default Credentials (ADC)');
    }

    initializeApp(appConfig);
    // initializeApp() succeeds even without credentials — getFirestore() is
    // where the "Could not load the default credentials" error actually fires.
    // Test it now so firebaseInitialized reflects real availability.
    try { getFirestore(); firebaseInitialized = true; } catch (err: any) {
      firebaseInitialized = false;
      firebaseErrorMessage = err.message || 'Failed to connect to Firestore (missing credentials).';
      console.error('[Server] Firebase Admin: getFirestore() failed after initializeApp() —', err.message);
    }
    if (firebaseInitialized) {
      console.log(`[Server] Firebase Admin initialized (project: ${firebaseProjectId})`);
    }
  } catch (err: any) {
    firebaseErrorMessage = err.message || 'Firebase Admin initialization failed';
    console.error('[Server] Firebase Admin initialization failed:', err.message);
  }
}

export { firebaseInitialized, firebaseErrorMessage };

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

// Public share pages — served BEFORE /api middleware (no auth needed)
app.use('/share', sharePageRouter);

// Attach the AI service to the request for route handlers
app.use('/api/v1', (req, _res, next) => {
  (req as any).aiService = aiService;
  next();
});

app.use('/api/v1/architect', architectRouter);
app.use('/api/v1/sourcing', sourcingRouter);
app.use('/api/v1/generate', generationRouter);
app.use('/api/v1/projects', projectsRouter);
app.use('/api/v1/shares', sharesRouter);
app.use('/api/v1/ai', aiRouter);
app.use('/api/v1/admin', adminRouter);

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
