#!/usr/bin/env node
/**
 * Minimal Firecrawl-compatible scrape service for LOCAL DEV ONLY.
 *
 * Implements just the contract BuildSheet's procurement pipeline needs:
 *   POST /v1/scrape  { url, formats:['markdown'], timeout }  ->  { data: { markdown, metadata } }
 *
 * Not production: single-threaded, no queue, no auth, best-effort. Replace
 * with a real Firecrawl deployment for anything beyond local development.
 */
import http from 'node:http';

const PORT = 3002;

// Lightweight HTML->text: strip scripts/styles, then convert common tags to
// markdown-ish text. Good enough for product-page price/stock extraction.
function htmlToMarkdown(html) {
  const text = html
    // keep <script>/<style> out
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    // block elements -> newlines
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|td|section|article|header|footer)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // headings -> ## markers
    .replace(/<h1[^>]*>/gi, '\n# ')
    .replace(/<h2[^>]*>/gi, '\n## ')
    .replace(/<h3[^>]*>/gi, '\n### ')
    .replace(/<h4[^>]*>/gi, '\n#### ')
    .replace(/<li[^>]*>/gi, '- ')
    // anchors -> [text](url)
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    // strip remaining tags
    .replace(/<[^>]+>/g, '')
    // entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // collapse whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return text;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // /health
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })); return; }

  if (req.method === 'POST' && req.url === '/v1/scrape') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e7) { res.writeHead(413); res.end('{}'); req.destroy(); } });
    req.on('end', async () => {
      try {
        const { url, timeout } = JSON.parse(body || '{}');
        if (!url) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'url required' })); return; }
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), Math.min(timeout || 15000, 20000));
        try {
          const resp = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (BuildSheet local scrape)' } });
          const html = await resp.text();
          const markdown = htmlToMarkdown(html);
          clearTimeout(t);
          const ogImage = (html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || [])[1] || undefined;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { markdown, metadata: { ogImage, sourceURL: url } } }));
        } catch (e) {
          clearTimeout(t);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: String(e && e.message || e) }));
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e && e.message || e) }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => console.log(`[scrape-service] listening on :${PORT}`));
