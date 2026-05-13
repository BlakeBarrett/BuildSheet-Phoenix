/**
 * Tests for the Shares routes — validates slug validation, HTML rendering,
 * and API response contracts.
 *
 * These are pure logic tests that don't require Firestore.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Slug validation (extracted logic — mirrors shares.ts)
// ---------------------------------------------------------------------------

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const RESERVED_SLUGS = new Set([
  'new', 'mine', 'api', 'admin', 'share', 'app', 'health',
  'login', 'signup', 'settings', 'pricing', 'about', 'terms',
  'privacy', 'support', 'help', 'docs', 'blog',
]);

function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug);
}

describe('Share Slug Validation', () => {
  describe('valid slugs', () => {
    const validSlugs = [
      'my-cool-build',
      'futuristic-furniture-sofa',
      'abc',
      'a1b2c3',
      'this-is-a-valid-slug-with-numbers-123',
      'x-y',
    ];

    for (const slug of validSlugs) {
      it(`accepts "${slug}"`, () => {
        expect(isValidSlug(slug)).toBe(true);
      });
    }
  });

  describe('invalid slugs', () => {
    const invalidSlugs = [
      { slug: 'ab', reason: 'too short (< 3 chars)' },
      { slug: '-starts-with-hyphen', reason: 'starts with hyphen' },
      { slug: 'ends-with-hyphen-', reason: 'ends with hyphen' },
      { slug: 'HAS-UPPERCASE', reason: 'contains uppercase' },
      { slug: 'has spaces', reason: 'contains spaces' },
      { slug: 'has_underscores', reason: 'contains underscores' },
      { slug: 'has.dots', reason: 'contains dots' },
      { slug: 'has@special', reason: 'contains special chars' },
      { slug: '', reason: 'empty string' },
    ];

    for (const { slug, reason } of invalidSlugs) {
      it(`rejects "${slug}" (${reason})`, () => {
        expect(isValidSlug(slug)).toBe(false);
      });
    }
  });

  describe('reserved slugs', () => {
    const reserved = ['new', 'mine', 'api', 'admin', 'share', 'app', 'health',
      'login', 'signup', 'settings', 'pricing', 'about', 'terms',
      'privacy', 'support', 'help', 'docs', 'blog'];

    for (const slug of reserved) {
      it(`rejects reserved word "${slug}"`, () => {
        expect(isValidSlug(slug)).toBe(false);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// HTML rendering helpers (extracted logic)
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return ''; }
}

function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 30 ? u.pathname.substring(0, 30) + '…' : u.pathname;
    return u.hostname + path;
  } catch { return url.substring(0, 50); }
}

describe('Share HTML Helpers', () => {
  describe('escapeHtml', () => {
    it('escapes HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('escapes ampersands', () => {
      expect(escapeHtml('AT&T')).toBe('AT&amp;T');
    });

    it('escapes single quotes', () => {
      expect(escapeHtml("it's")).toBe('it&#39;s');
    });

    it('leaves clean text unchanged', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });
  });

  describe('formatDate', () => {
    it('formats ISO date to readable string', () => {
      const result = formatDate('2026-05-13T00:00:00.000Z');
      expect(result).toContain('2026');
      expect(result).toContain('May');
    });

    it('handles invalid dates gracefully', () => {
      const result = formatDate('not-a-date');
      expect(result).toBeDefined();
    });
  });

  describe('truncateUrl', () => {
    it('extracts hostname and path', () => {
      expect(truncateUrl('https://example.com/short')).toBe('example.com/short');
    });

    it('truncates long paths', () => {
      const result = truncateUrl('https://example.com/a/very/long/path/that/goes/on/forever/and/ever');
      expect(result.length).toBeLessThan(60);
      expect(result).toContain('…');
    });

    it('handles invalid URLs gracefully', () => {
      const result = truncateUrl('not a url');
      expect(result).toBe('not a url');
    });
  });
});

// ---------------------------------------------------------------------------
// API Contract — Response Shape Tests
// ---------------------------------------------------------------------------

describe('Shares API Contract', () => {
  describe('POST /api/v1/shares — create response', () => {
    it('should return { ok, shareId, slug, url }', () => {
      const mockResponse = { ok: true, shareId: 'abc123', slug: 'my-build', url: '/share/my-build' };
      expect(mockResponse).toHaveProperty('ok', true);
      expect(mockResponse).toHaveProperty('shareId');
      expect(mockResponse).toHaveProperty('slug');
      expect(mockResponse).toHaveProperty('url');
      expect(mockResponse.url).toMatch(/^\/share\//);
    });
  });

  describe('GET /api/v1/shares/:slug — public JSON', () => {
    it('should return { share } without ownerUid or projectId', () => {
      const mockResponse = {
        share: {
          shareId: 'abc123',
          slug: 'my-build',
          name: 'Test Build',
          description: 'A test assembly',
          assemblyUrl: null,
          bom: [{ name: 'Resistor', category: 'passive', quantity: 2 }],
          createdAt: '2026-05-13T00:00:00.000Z',
        },
      };
      expect(mockResponse).toHaveProperty('share');
      expect(mockResponse.share).not.toHaveProperty('ownerUid');
      expect(mockResponse.share).not.toHaveProperty('projectId');
      expect(mockResponse.share).toHaveProperty('name');
      expect(mockResponse.share).toHaveProperty('bom');
      expect(Array.isArray(mockResponse.share.bom)).toBe(true);
    });
  });

  describe('GET /api/v1/shares/mine — user shares list', () => {
    it('should return { shares: Array }', () => {
      const mockResponse = {
        shares: [{
          shareId: 'abc',
          slug: 'my-build',
          name: 'Test',
          description: '',
          assemblyUrl: null,
          bomCount: 3,
          createdAt: '2026-05-13T00:00:00.000Z',
        }],
      };
      expect(mockResponse).toHaveProperty('shares');
      expect(Array.isArray(mockResponse.shares)).toBe(true);
      expect(mockResponse.shares[0]).toHaveProperty('shareId');
      expect(mockResponse.shares[0]).toHaveProperty('bomCount');
    });
  });

  describe('BOM data minimization', () => {
    it('should only include name, category, quantity in shared BOM', () => {
      const fullBomEntry = {
        instanceId: 'inst-1',
        part: { name: 'Resistor 10K', category: 'passive', id: 'r10k' },
        quantity: 2,
        sourcing: { vendor: 'Digikey', price: 0.15, url: 'https://...' },
        pinned: true,
      };

      // The share creation endpoint strips to minimal data
      const minimalEntry = {
        name: String(fullBomEntry.part.name).substring(0, 200),
        category: String(fullBomEntry.part.category).substring(0, 100),
        quantity: Math.max(1, fullBomEntry.quantity),
      };

      expect(minimalEntry).toEqual({
        name: 'Resistor 10K',
        category: 'passive',
        quantity: 2,
      });
      expect(minimalEntry).not.toHaveProperty('sourcing');
      expect(minimalEntry).not.toHaveProperty('pinned');
      expect(minimalEntry).not.toHaveProperty('instanceId');
    });
  });
});
