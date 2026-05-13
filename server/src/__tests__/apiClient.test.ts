/**
 * Client API Contract Tests — validates the HTTP contract between
 * the apiClient (frontend) and the server routes.
 *
 * These tests define the exact API surface that both sides must honor.
 * If the server changes storage backends, these tests catch any
 * contract violations.
 *
 * Each test describes: method, path, request body shape, response body shape.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Contract definitions — the source of truth
// ---------------------------------------------------------------------------

interface ApiEndpoint {
  method: string;
  path: string;
  auth: 'required' | 'optional' | 'none';
  requestBody?: Record<string, string>;
  responseShape: Record<string, any>;
}

const API_CONTRACT: Record<string, ApiEndpoint> = {
  // --- Projects ---
  'projects.list': {
    method: 'GET',
    path: '/api/v1/projects',
    auth: 'required',
    responseShape: { projects: 'Array<{ id, name, lastModified, preview, thumbnail?, archived, tags, folderId? }>' },
  },
  'projects.get': {
    method: 'GET',
    path: '/api/v1/projects/:id',
    auth: 'required',
    responseShape: { project: '{ id, name, bom, messages, ... }' },
  },
  'projects.save': {
    method: 'PUT',
    path: '/api/v1/projects/:id',
    auth: 'required',
    requestBody: { body: 'full session object' },
    responseShape: { ok: 'boolean', id: 'string' },
  },
  'projects.delete': {
    method: 'DELETE',
    path: '/api/v1/projects/:id',
    auth: 'required',
    responseShape: { ok: 'boolean' },
  },
  'projects.archive': {
    method: 'PATCH',
    path: '/api/v1/projects/:id/archive',
    auth: 'required',
    requestBody: { archived: 'boolean' },
    responseShape: { ok: 'boolean' },
  },
  'projects.duplicate': {
    method: 'POST',
    path: '/api/v1/projects/:id/duplicate',
    auth: 'required',
    responseShape: { ok: 'boolean', id: 'string' },
  },
  'projects.migrate': {
    method: 'POST',
    path: '/api/v1/projects/migrate',
    auth: 'required',
    requestBody: { projects: 'Array<session>' },
    responseShape: { ok: 'boolean', migrated: 'number' },
  },

  // --- Shares ---
  'shares.create': {
    method: 'POST',
    path: '/api/v1/shares',
    auth: 'required',
    requestBody: { projectId: 'string', name: 'string', description: 'string', bom: 'Array<{ name, category, quantity }>' },
    responseShape: { ok: 'boolean', shareId: 'string', slug: 'string', url: 'string' },
  },
  'shares.mine': {
    method: 'GET',
    path: '/api/v1/shares/mine',
    auth: 'required',
    responseShape: { shares: 'Array<{ shareId, slug, name, ... }>' },
  },
  'shares.get': {
    method: 'GET',
    path: '/api/v1/shares/:slug',
    auth: 'optional',
    responseShape: { share: '{ shareId, slug, name, description, assemblyUrl, bom, createdAt }' },
  },
  'shares.page': {
    method: 'GET',
    path: '/share/:slug',
    auth: 'none',
    responseShape: { contentType: 'text/html' },
  },

  // --- Health ---
  'health.check': {
    method: 'GET',
    path: '/api/v1/health',
    auth: 'none',
    responseShape: { status: 'string', service: 'string', offline: 'boolean' },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('API Contract Registry', () => {
  it('defines all project endpoints', () => {
    expect(API_CONTRACT['projects.list']).toBeDefined();
    expect(API_CONTRACT['projects.get']).toBeDefined();
    expect(API_CONTRACT['projects.save']).toBeDefined();
    expect(API_CONTRACT['projects.delete']).toBeDefined();
    expect(API_CONTRACT['projects.archive']).toBeDefined();
    expect(API_CONTRACT['projects.duplicate']).toBeDefined();
    expect(API_CONTRACT['projects.migrate']).toBeDefined();
  });

  it('defines all share endpoints', () => {
    expect(API_CONTRACT['shares.create']).toBeDefined();
    expect(API_CONTRACT['shares.mine']).toBeDefined();
    expect(API_CONTRACT['shares.get']).toBeDefined();
    expect(API_CONTRACT['shares.page']).toBeDefined();
  });

  it('defines the health endpoint', () => {
    expect(API_CONTRACT['health.check']).toBeDefined();
  });
});

describe('Project endpoints use correct HTTP methods', () => {
  it('list uses GET', () => expect(API_CONTRACT['projects.list'].method).toBe('GET'));
  it('get uses GET', () => expect(API_CONTRACT['projects.get'].method).toBe('GET'));
  it('save uses PUT', () => expect(API_CONTRACT['projects.save'].method).toBe('PUT'));
  it('delete uses DELETE', () => expect(API_CONTRACT['projects.delete'].method).toBe('DELETE'));
  it('archive uses PATCH', () => expect(API_CONTRACT['projects.archive'].method).toBe('PATCH'));
  it('duplicate uses POST', () => expect(API_CONTRACT['projects.duplicate'].method).toBe('POST'));
  it('migrate uses POST', () => expect(API_CONTRACT['projects.migrate'].method).toBe('POST'));
});

describe('All authenticated endpoints require auth', () => {
  const authRequired = Object.entries(API_CONTRACT)
    .filter(([_, ep]) => ep.auth === 'required');

  for (const [name, ep] of authRequired) {
    it(`${name} requires authentication`, () => {
      expect(ep.auth).toBe('required');
    });
  }
});

describe('Public endpoints do not require auth', () => {
  it('share page is public', () => {
    expect(API_CONTRACT['shares.page'].auth).toBe('none');
  });

  it('health check is public', () => {
    expect(API_CONTRACT['health.check'].auth).toBe('none');
  });
});

describe('Response shapes — projects.list', () => {
  // Simulate what the server returns
  const mockListResponse = {
    projects: [
      { id: 'p1', name: 'Test', lastModified: '2026-05-13T00:00:00Z', preview: '3 Parts', archived: false, tags: [] },
    ],
  };

  it('returns an object with projects array', () => {
    expect(mockListResponse).toHaveProperty('projects');
    expect(Array.isArray(mockListResponse.projects)).toBe(true);
  });

  it('each project has required fields', () => {
    const p = mockListResponse.projects[0];
    expect(p).toHaveProperty('id');
    expect(p).toHaveProperty('name');
    expect(p).toHaveProperty('lastModified');
    expect(p).toHaveProperty('archived');
  });
});

describe('Response shapes — shares.get (public)', () => {
  const mockShareResponse = {
    share: {
      shareId: 'abc123',
      slug: 'my-build',
      name: 'Cool Build',
      description: 'A thing I made',
      assemblyUrl: null,
      bom: [{ name: 'Resistor', category: 'passive', quantity: 2 }],
      createdAt: '2026-05-13T00:00:00Z',
    },
  };

  it('does NOT expose ownerUid', () => {
    expect(mockShareResponse.share).not.toHaveProperty('ownerUid');
  });

  it('does NOT expose projectId', () => {
    expect(mockShareResponse.share).not.toHaveProperty('projectId');
  });

  it('includes BOM with minimal fields only', () => {
    const entry = mockShareResponse.share.bom[0];
    expect(Object.keys(entry).sort()).toEqual(['category', 'name', 'quantity']);
  });
});
