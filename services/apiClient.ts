/**
 * API Client — thin HTTP wrapper for the BuildSheet backend API.
 * 
 * Handles Firebase ID token attachment, SSE streaming for architect chat,
 * and typed request/response wrappers for all API routes.
 */
import { getFirebaseAuth } from './firebase.ts';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Base URL for the API server. In dev, Vite proxies /api to localhost:8081. */
const API_BASE = '/api/v1';

// ---------------------------------------------------------------------------
// Token Management
// ---------------------------------------------------------------------------

async function getIdToken(): Promise<string | null> {
  try {
    const auth = getFirebaseAuth();
    if (!auth?.currentUser) return null;
    return await auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await getIdToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ---------------------------------------------------------------------------
// Generic HTTP helpers
// ---------------------------------------------------------------------------

async function post<T = any>(path: string, body: any): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    const msg = err.error || `API error ${resp.status}`;
    // 503 with syncUnavailable: server's Firebase is broken — produce a user-friendly error
    if (resp.status === 503 && err.syncUnavailable) {
      return Promise.reject(new Error(msg));
    }
    // 500 with 'credentials' in message: server tried getFirestore() without creds
    if (resp.status === 500 && (err.error || '').includes('credentials')) {
      return Promise.reject(new Error(msg));
    }
    // 500 with 'Firestore' in message: same as above (catch partial error text)
    if (resp.status === 500 && (err.error || '').includes('Firestore')) {
      return Promise.reject(new Error(msg));
    }
    throw new Error(msg);
  }
  return resp.json();
}

async function get<T = any>(path: string): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: await authHeaders(),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    const msg = err.error || `API error ${resp.status}`;
    // 503 with syncUnavailable: server's Firebase is broken — produce a user-friendly error
    if (resp.status === 503 && err.syncUnavailable) {
      return Promise.reject(new Error(msg));
    }
    // 500 with 'credentials' in message: server tried getFirestore() without creds
    if (resp.status === 500 && (err.error || '').includes('credentials')) {
      return Promise.reject(new Error(msg));
    }
    // 500 with 'Firestore' in message: same as above (catch partial error text)
    if (resp.status === 500 && (err.error || '').includes('Firestore')) {
      return Promise.reject(new Error(msg));
    }
    throw new Error(msg);
  }
  return resp.json();
}

async function put<T = any>(path: string, body: any): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    const msg = err.error || `API error ${resp.status}`;
    // 503 with syncUnavailable: server's Firebase is broken — produce a user-friendly error
    if (resp.status === 503 && err.syncUnavailable) {
      return Promise.reject(new Error(msg));
    }
    // 500 with 'credentials' in message: server tried getFirestore() without creds
    if (resp.status === 500 && (err.error || '').includes('credentials')) {
      return Promise.reject(new Error(msg));
    }
    // 500 with 'Firestore' in message: same as above (catch partial error text)
    if (resp.status === 500 && (err.error || '').includes('Firestore')) {
      return Promise.reject(new Error(msg));
    }
    throw new Error(msg);
  }
  return resp.json();
}

async function del<T = any>(path: string): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    const msg = err.error || `API error ${resp.status}`;
    // 503 with syncUnavailable: server's Firebase is broken — produce a user-friendly error
    if (resp.status === 503 && err.syncUnavailable) {
      return Promise.reject(new Error(msg));
    }
    // 500 with 'credentials' in message: server tried getFirestore() without creds
    if (resp.status === 500 && (err.error || '').includes('credentials')) {
      return Promise.reject(new Error(msg));
    }
    // 500 with 'Firestore' in message: same as above (catch partial error text)
    if (resp.status === 500 && (err.error || '').includes('Firestore')) {
      return Promise.reject(new Error(msg));
    }
    throw new Error(msg);
  }
  return resp.json();
}

async function patch<T = any>(path: string, body: any): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    const msg = err.error || `API error ${resp.status}`;
    // 503 with syncUnavailable: server's Firebase is broken — produce a user-friendly error
    if (resp.status === 503 && err.syncUnavailable) {
      return Promise.reject(new Error(msg));
    }
    // 500 with 'credentials' in message: server tried getFirestore() without creds
    if (resp.status === 500 && (err.error || '').includes('credentials')) {
      return Promise.reject(new Error(msg));
    }
    // 500 with 'Firestore' in message: same as above (catch partial error text)
    if (resp.status === 500 && (err.error || '').includes('Firestore')) {
      return Promise.reject(new Error(msg));
    }
    throw new Error(msg);
  }
  return resp.json();
}

// ---------------------------------------------------------------------------
// SSE Streaming helper
// ---------------------------------------------------------------------------

export interface SSECallbacks {
  onChunk: (text: string) => void;
  onDone: (result: any) => void;
  onError: (error: string) => void;
}

/**
 * Opens an SSE connection to the architect chat endpoint.
 * Streams partial text chunks and a final result event.
 */
async function streamPost(path: string, body: any, callbacks: SSECallbacks): Promise<void> {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    callbacks.onError(err.error || `API error ${resp.status}`);
    return;
  }

  const reader = resp.body?.getReader();
  if (!reader) { callbacks.onError('No response body'); return; }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.substring(6));
        if (event.type === 'chunk') callbacks.onChunk(event.data);
        else if (event.type === 'done') callbacks.onDone(event.data);
        else if (event.type === 'error') callbacks.onError(event.data);
      } catch { /* skip malformed events */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Architect API
// ---------------------------------------------------------------------------

export const architectApi = {
  /** Stream architect chat with SSE. */
  chat: (prompt: string, history: any[], image?: string, callbacks?: SSECallbacks) => {
    if (callbacks) {
      return streamPost('/architect/chat', { prompt, history, image }, callbacks);
    }
    return post<{ text: string; metadata?: any }>('/architect/chat', { prompt, history, image });
  },

  verify: (bom: any[], requirements: string, previousAudit?: string, advancedChecks?: any[]) =>
    post('/architect/verify', { bom, requirements, previousAudit, advancedChecks }),

  assemblyPlan: (bom: any[], previousPlan?: any) =>
    post('/architect/assembly-plan', { bom, previousPlan }),

  applyAudit: (bom: any[], auditResult: string, requirements: string) =>
    post('/architect/apply-audit', { bom, auditResult, requirements }),
};

// ---------------------------------------------------------------------------
// Sourcing API
// ---------------------------------------------------------------------------

export const sourcingApi = {
  find: (query: string, designContext?: string, localeContext?: string, preferredVendors?: string[]) =>
    post<{ results: any[] }>('/sourcing/find', { query, designContext, localeContext, preferredVendors }),

  search: (query: string, designContext?: string, localeContext?: string, preferredVendors?: string[]) =>
    post<{ query: string; products: any[]; localSuppliers: any[]; groundedAt: string }>('/sourcing/search', { query, designContext, localeContext, preferredVendors }),

  hydrate: (name: string, category: string, designContext?: string, localeContext?: string, preferredVendors?: string[]) =>
    post<{ result: any }>('/sourcing/hydrate', { name, category, designContext, localeContext, preferredVendors }),

  local: (query: string) =>
    post<{ results: any[] }>('/sourcing/local', { query }),

  procure: (query: string, category: string, designContext?: string, localeContext?: string, preferredVendors?: string[]) =>
    post('/sourcing/procure', { query, category, designContext, localeContext, preferredVendors }),
};

// ---------------------------------------------------------------------------
// Generation API
// ---------------------------------------------------------------------------

export const generationApi = {
  image: (description: string, referenceImage?: string) =>
    post<{ url: string | null }>('/generate/image', { description, referenceImage }),

  fabrication: (partName: string, context: string) =>
    post<{ brief: string }>('/generate/fabrication', { partName, context }),

  qaProtocol: (partName: string, category: string) =>
    post('/generate/qa-protocol', { partName, category }),

  enclosure: (context: string, bom: any[]) =>
    post('/generate/enclosure', { context, bom }),

  identify: (image: string) =>
    post('/generate/identify', { image }),

  arGuidance: (image: string, currentStep: number, plan: any) =>
    post<string>('/generate/ar-guidance', { image, currentStep, plan }),
};

// ---------------------------------------------------------------------------
// Projects API
// ---------------------------------------------------------------------------

export const projectsApi = {
  list: () => get<{ projects: any[] }>('/projects'),

  getProject: (id: string) => get<{ project: any }>(`/projects/${id}`),

  save: (id: string, session: any) => put(`/projects/${id}`, session),

  deleteProject: (id: string) => del(`/projects/${id}`),

  archive: (id: string, archived: boolean) => patch(`/projects/${id}/archive`, { archived }),

  duplicate: (id: string) => post<{ ok: boolean; id: string }>(`/projects/${id}/duplicate`, {}),

  migrate: (projects: any[]) => post<{ ok: boolean; migrated: number }>('/projects/migrate', { projects }),
};

// ---------------------------------------------------------------------------
// Shares API
// ---------------------------------------------------------------------------

export const sharesApi = {
  create: (data: { projectId: string; name: string; description: string; assemblyUrl?: string; slug?: string; bom: { name: string; category: string; quantity: number }[] }) =>
    post<{ ok: boolean; shareId: string; slug: string; url: string }>('/shares', data),

  mine: () => get<{ shares: any[] }>('/shares/mine'),

  getShare: (slug: string) => get<{ share: any }>(`/shares/${slug}`),
};

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

export const healthApi = {
  check: () => get<{ status: string; service: string; offline: boolean }>('/health'),
};
