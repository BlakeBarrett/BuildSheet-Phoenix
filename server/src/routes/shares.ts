/**
 * Share Links — public share pages and share CRUD API.
 *
 * Two routers are exported:
 *   sharePageRouter — serves server-rendered HTML at /share/:slug (public, no auth)
 *   sharesRouter    — JSON API at /api/v1/shares/* (auth required for writes)
 */
import { Router, type Request, type Response } from 'express';
import { nanoid } from 'nanoid';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { apiRateLimit } from '../middleware/rateLimit.js';
import { getFirestore } from 'firebase-admin/firestore';
import { isDev } from '../config.js';

// ---------------------------------------------------------------------------
// Slug validation
// ---------------------------------------------------------------------------

function getSharesCollection() {
  return getFirestore().collection('shares');
}

/** Strict slug charset — used both at create-time and defensively at render. */
export const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;

/** Accepts only real http/https URLs (blocks data:, javascript:, and control chars). */
export function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    // Reject control characters / spaces which are never valid in a URL we render
    if (/[\u0000-\u001f\u007f\s]/.test(value)) return false;
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Local Memory Fallback (for local development without credentials)
// ---------------------------------------------------------------------------
const isLocal = isDev();
const localSharesStore = new Map<string, any>();

async function getShareDocLocallyOrRemote(slugOrId: string) {
  const col = getSharesCollection();
  try {
    let doc = await col.doc(slugOrId).get();
    if (!doc.exists) {
      const snap = await col.where('slug', '==', slugOrId).limit(1).get();
      if (!snap.empty) doc = snap.docs[0];
    }
    if (doc.exists) return { id: doc.id, data: doc.data() };
    return null;
  } catch (err: any) {
    if (isLocal && (err.message.includes('credentials') || err.message.includes('Permission') || err.message.includes('NOT_FOUND'))) {
      const byId = localSharesStore.get(slugOrId);
      if (byId) return { id: slugOrId, data: byId };
      const bySlug = Array.from(localSharesStore.values()).find(s => s.slug === slugOrId);
      if (bySlug) return { id: bySlug.shareId, data: bySlug };
      return null;
    }
    throw err;
  }
}

async function isSlugTakenLocallyOrRemote(slug: string) {
  try {
    const col = getSharesCollection();
    const existing = await col.where('slug', '==', slug).limit(1).get();
    return !existing.empty;
  } catch (err: any) {
    if (isLocal && (err.message.includes('credentials') || err.message.includes('Permission') || err.message.includes('NOT_FOUND'))) {
      return Array.from(localSharesStore.values()).some(s => s.slug === slug);
    }
    throw err;
  }
}

async function saveShareLocallyOrRemote(shareId: string, shareDoc: any) {
  try {
    const col = getSharesCollection();
    await col.doc(shareId).set(shareDoc);
  } catch (err: any) {
    if (isLocal && (err.message.includes('credentials') || err.message.includes('Permission') || err.message.includes('NOT_FOUND'))) {
      console.warn('[shares] Firebase ADC missing. Using in-memory mock for local dev.');
      localSharesStore.set(shareId, shareDoc);
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Share page HTML template
// ---------------------------------------------------------------------------

export function renderSharePage(share: any, host: string): string {
  const shareUrl = `https://${host}/share/${share.slug}`;
  const remixUrl = `/app/?remix=${encodeURIComponent(share.slug)}`;
  const escapedName = escapeHtml(share.name || 'Untitled Build');
  const escapedDesc = escapeHtml(share.description || '');
  const escapedAssemblyUrl = share.assemblyUrl ? escapeHtml(share.assemblyUrl) : '';
  // Only use a real http(s) URL for the CSS flourish — never emit attacker
  // input into a <style> block unless it passes strict validation AND is
  // CSS-string-escaped (prevents </style><script> breakout).
  const cssSafeAssemblyUrl = isValidHttpUrl(String(share.assemblyUrl || ''))
    ? escapeCssString(String(share.assemblyUrl))
    : '';
  const escapedShareUrl = escapeHtml(shareUrl);
  // JS string + HTML attribute escaping for the inline onclick handler.
  const jsSafeShareUrl = escapeJsString(shareUrl);

  // BOM table rows
  const bomRows = (share.bom || [])
    .map((entry: any) =>
      `<tr>
        <td>${escapeHtml(entry.name || '—')}</td>
        <td>${escapeHtml(entry.category || '—')}</td>
        <td class="qty">${entry.quantity || 1}</td>
      </tr>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedName} — BuildSheet</title>

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapedName}">
  <meta property="og:description" content="${escapedDesc || 'A hardware assembly shared on BuildSheet.'}">
  <meta property="og:url" content="${escapedShareUrl}">
  ${escapedAssemblyUrl ? `<meta property="og:image" content="${escapedAssemblyUrl}">` : ''}
  <meta property="og:site_name" content="BuildSheet">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapedName}">
  <meta name="twitter:description" content="${escapedDesc || 'A hardware assembly shared on BuildSheet.'}">
  ${escapedAssemblyUrl ? `<meta name="twitter:image" content="${escapedAssemblyUrl}">` : ''}

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
      background: #0a0a0f;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      overflow-x: hidden;
    }

    /* Background flourish */
    .bg-flourish {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: -1;
      background: #0a0a0f;
      ${cssSafeAssemblyUrl ? `
      background-image: url('${cssSafeAssemblyUrl}');
      background-size: cover;
      background-position: center;
      filter: blur(60px) brightness(0.45);
      transform: scale(1.15);
      opacity: 1;
      ` : ''}
    }

    .container {
      max-width: 720px;
      width: 100%;
      padding: 2rem 1.5rem;
      position: relative;
      z-index: 10;
    }

    /* Header */
    .brand {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 2.5rem;
      text-decoration: none;
      color: #94a3b8;
      font-size: 0.875rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      opacity: 0.8;
      transition: opacity 0.2s;
    }
    .brand:hover { color: #e2e8f0; opacity: 1; }
    .brand-icon {
      width: 28px; height: 28px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 14px; color: #fff;
    }

    /* Card with Glassmorphism */
    .card {
      background: rgba(20, 20, 31, 0.7);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(99, 102, 241, 0.2);
      border-radius: 24px;
      padding: 3rem 2.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    }

    .card h1 {
      font-size: 1.75rem;
      font-weight: 700;
      line-height: 1.3;
      margin-bottom: 1rem;
      background: linear-gradient(135deg, #e2e8f0 0%, #a5b4fc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .description {
      color: #94a3b8;
      font-size: 1.05rem;
      line-height: 1.7;
      margin-bottom: 1.5rem;
      white-space: pre-wrap;
      max-height: 20rem;
      overflow-y: auto;
    }

    .assembly-url {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      color: #818cf8;
      font-size: 0.875rem;
      text-decoration: none;
      margin-bottom: 1.5rem;
      word-break: break-all;
    }
    .assembly-url:hover { color: #a5b4fc; text-decoration: underline; }

    /* BOM Table */
    .bom-section {
      margin-top: 1.5rem;
    }
    .bom-section h2 {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #64748b;
      margin-bottom: 0.75rem;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    thead th {
      text-align: left;
      color: #64748b;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid rgba(99, 102, 241, 0.15);
    }
    thead th.qty { text-align: center; }
    tbody tr { border-bottom: 1px solid rgba(255, 255, 255, 0.04); }
    tbody tr:nth-child(even) { background: rgba(99, 102, 241, 0.03); }
    tbody td { padding: 0.6rem 0.75rem; color: #cbd5e1; }
    tbody td.qty { text-align: center; color: #94a3b8; }

    /* Remix Button */
    .actions {
      display: flex;
      gap: 1rem;
      margin-top: 2rem;
      flex-wrap: wrap;
    }
    .btn-remix {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.75rem;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff;
      font-weight: 600;
      font-size: 1rem;
      border: none;
      border-radius: 10px;
      text-decoration: none;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
      box-shadow: 0 2px 12px rgba(99, 102, 241, 0.3);
    }
    .btn-remix:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 20px rgba(99, 102, 241, 0.5);
    }
    .btn-copy {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      background: transparent;
      color: #94a3b8;
      font-weight: 500;
      font-size: 0.9rem;
      border: 1px solid rgba(99, 102, 241, 0.25);
      border-radius: 10px;
      text-decoration: none;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
    }
    .btn-copy:hover { border-color: #6366f1; color: #e2e8f0; }

    /* Version badge */
    .meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
    }
    .badge {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      font-weight: 600;
    }
    .badge-shared {
      background: rgba(99, 102, 241, 0.15);
      color: #818cf8;
      border: 1px solid rgba(99, 102, 241, 0.25);
    }
    .badge-date {
      color: #64748b;
      font-size: 0.8rem;
      font-weight: 400;
    }

    /* Footer */
    .footer {
      text-align: center;
      padding: 2rem 0;
      color: #475569;
      font-size: 0.8rem;
    }
    .footer a { color: #6366f1; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }

    @media (max-width: 520px) {
      .card { padding: 1.5rem; }
      .card h1 { font-size: 1.35rem; }
      .actions { flex-direction: column; }
      .btn-remix, .btn-copy { width: 100%; justify-content: center; }
    }
  </style>
</head>
<body>
  <div class="bg-flourish"></div>
  <div class="container">
    <a href="/" class="brand">
      <span class="brand-icon">B</span>
      BuildSheet
    </a>

    <div class="card">
      <div class="meta">
        <span class="badge badge-shared">Shared Build</span>
        <span class="badge-date">${escapeHtml(formatDate(share.createdAt))}</span>
      </div>

      <h1>${escapedName}</h1>

      ${escapedDesc ? `<div class="description">${escapedDesc}</div>` : ''}

      ${bomRows ? `
      <div class="bom-section">
        <h2>Bill of Materials · ${(share.bom || []).length} parts</h2>
        <table>
          <thead>
            <tr><th>Part</th><th>Category</th><th class="qty">Qty</th></tr>
          </thead>
          <tbody>
            ${bomRows}
          </tbody>
        </table>
      </div>` : ''}

      <div class="actions">
        <a href="${remixUrl}" class="btn-remix">⚡ Remix This Build</a>
        <button class="btn-copy" onclick="navigator.clipboard.writeText('${jsSafeShareUrl}');this.textContent='✓ Copied!'">📋 Copy Link</button>
      </div>
    </div>

    <div class="footer">
      Powered by <a href="/">BuildSheet</a> — AI-Native Hardware Architect
    </div>
  </div>
</body>
</html>`;
}

function render404Page(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Build Not Found — BuildSheet</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0f; color: #e2e8f0;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      text-align: center;
    }
    h1 { font-size: 4rem; color: #6366f1; margin-bottom: 0.5rem; }
    p { color: #94a3b8; font-size: 1.1rem; margin-bottom: 2rem; }
    a { color: #818cf8; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div>
    <h1>404</h1>
    <p>This build doesn't exist or the link has expired.</p>
    <a href="/">← Back to BuildSheet</a>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape a string for use inside a CSS single-quoted string that lives inside a
 * <style> block. CSS hex-escapes `<`/`>` so a crafted URL cannot terminate the
 * <style> element, and backslash-escapes quotes so the string cannot be broken.
 */
export function escapeCssString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/</g, '\\3C ')
    .replace(/>/g, '\\3E ')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ');
}

/**
 * Escape a string for embedding inside a double-quoted HTML attribute that is
 * parsed as JavaScript (inline onclick). Handles JS string escaping, HTML
 * attribute escaping, and `</script>`/newline termination.
 */
export function escapeJsString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

// ---------------------------------------------------------------------------
// Public Share Page Router — serves HTML at /share/:slug
// ---------------------------------------------------------------------------

export const sharePageRouter = Router();

sharePageRouter.get('/:slug', async (req: Request, res: Response) => {
  try {
    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
    const doc = await getShareDocLocallyOrRemote(slug);

    if (!doc) {
      res.status(404).type('html').send(render404Page());
      return;
    }

    const host = req.get('host') || 'buildsheet.cloud';
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderSharePage({ ...doc.data, slug: doc.data?.slug || doc.id }, host));
  } catch (err: any) {
    console.error('[shares] Page render error:', err.message);
    res.status(500).type('html').send(render404Page());
  }
});

// ---------------------------------------------------------------------------
// API Router — JSON endpoints at /api/v1/shares/*
// ---------------------------------------------------------------------------

export const sharesRouter = Router();

/**
 * GET /api/v1/shares/mine — List shares for the current user.
 */
sharesRouter.get('/mine', requireAuth, async (req: Request, res: Response) => {
  try {
    let shares: any[] = [];
    try {
      const snapshot = await getSharesCollection()
        .where('ownerUid', '==', req.user!.uid)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      shares = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          shareId: doc.id,
          slug: d.slug || doc.id,
          name: d.name,
          description: d.description,
          assemblyUrl: d.assemblyUrl,
          bomCount: (d.bom || []).length,
          createdAt: d.createdAt,
        };
      });
    } catch (err: any) {
      if (isLocal && (err.message.includes('credentials') || err.message.includes('Permission') || err.message.includes('NOT_FOUND'))) {
        shares = Array.from(localSharesStore.values())
          .filter(s => s.ownerUid === req.user!.uid)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 50)
          .map(d => ({
            shareId: d.shareId,
            slug: d.slug || d.shareId,
            name: d.name,
            description: d.description,
            assemblyUrl: d.assemblyUrl,
            bomCount: (d.bom || []).length,
            createdAt: d.createdAt,
          }));
      } else {
        throw err;
      }
    }

    res.json({ shares });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/shares/:slug — Public JSON for a single share.
 */
sharesRouter.get('/:slug', optionalAuth, async (req: Request, res: Response) => {
  try {
    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
    const doc = await getShareDocLocallyOrRemote(slug);

    if (!doc) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    const d = doc.data!;
    // Public response — omit ownerUid and projectId
    res.json({
      share: {
        shareId: doc.id,
        slug: d.slug || doc.id,
        name: d.name,
        description: d.description,
        assemblyUrl: d.assemblyUrl,
        bom: d.bom || [],
        createdAt: d.createdAt,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/shares — Create a new share (immutable snapshot).
 * Body: { projectId, name, description, assemblyUrl?, slug?, bom }
 */
sharesRouter.post('/', optionalAuth, apiRateLimit, async (req: Request, res: Response) => {
  try {
    const { projectId, name, description, assemblyUrl, slug: requestedSlug, bom } = req.body;

    if (!name) { res.status(400).json({ error: 'name is required' }); return; }
    if (!Array.isArray(bom)) { res.status(400).json({ error: 'bom must be an array' }); return; }

    const col = getSharesCollection();

    // Determine slug: use the requested one if it's available, otherwise generate a short one.
    const normalized = requestedSlug ? String(requestedSlug).toLowerCase().trim() : '';
    // Enforce a strict slug charset — prevents XSS/JS-breakout in share URLs.
    const slugIsValid = normalized ? SLUG_PATTERN.test(normalized) : false;
    const isTaken = slugIsValid ? await isSlugTakenLocallyOrRemote(normalized) : true;
    const slug = (!isTaken && slugIsValid) ? normalized : nanoid(10);

    // Strip BOM to minimal data (name, category, quantity only)
    const minimalBom = bom.map((entry: any) => ({
      name: String(entry.name || '').substring(0, 200),
      category: String(entry.category || '').substring(0, 100),
      quantity: Math.max(1, parseInt(entry.quantity, 10) || 1),
    }));

    const shareId = nanoid(10);
    const now = new Date().toISOString();

    // Reject anything that isn't a real http/https URL — prevents data:,
    // javascript:, and other schemes from reaching the share page / CSS.
    if (assemblyUrl && !isValidHttpUrl(String(assemblyUrl))) {
      res.status(400).json({ error: 'assemblyUrl must be a valid http/https URL.' });
      return;
    }

    const shareDoc = {
      shareId,
      slug,
      name: String(name).substring(0, 200),
      description: String(description || '').substring(0, 2000),
      assemblyUrl: assemblyUrl ? String(assemblyUrl).substring(0, 2048) : null,
      bom: minimalBom,
      ownerUid: req.user!.uid,
      projectId: projectId || null,
      createdAt: now,
    };

    await saveShareLocallyOrRemote(shareId, shareDoc);

    res.status(201).json({
      ok: true,
      shareId,
      slug,
      url: `/share/${slug}`,
    });
  } catch (err: any) {
    console.error('[shares] Create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
