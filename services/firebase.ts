import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAnalytics, Analytics } from 'firebase/analytics';

/**
 * Read a config value from Vite build-time env first,
 * then fall back to runtime injection via window._env_ (Cloud Run).
 */
function env(key: string): string {
  return (import.meta.env[key] as string)
    ?? (window as any)._env_?.[key]
    ?? '';
}

const firebaseConfig = {
  apiKey: env('VITE_FIREBASE_API_KEY'),
  authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: env('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: env('VITE_FIREBASE_APP_ID'),
  measurementId: env('VITE_FIREBASE_MEASUREMENT_ID'),
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let analytics: Analytics | null = null;

/** True when a valid Firebase config is present (non-empty projectId). */
export function isFirebaseConfigured(): boolean {
  return !!firebaseConfig.projectId && !!firebaseConfig.apiKey;
}

function ensureInitialized() {
  if (!app && isFirebaseConfigured()) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    if (firebaseConfig.measurementId && typeof window !== 'undefined') {
      analytics = getAnalytics(app);
    }
  }
}

export function getFirebaseAuth(): Auth | null {
  ensureInitialized();
  return auth;
}

export function getFirebaseDb(): Firestore | null {
  ensureInitialized();
  return db;
}

export function getFirebaseAnalytics(): Analytics | null {
  ensureInitialized();
  return analytics;
}

export const googleProvider = new GoogleAuthProvider();