// Simple proxy server to forward AI requests to LM Studio
// This avoids CORS issues by proxying through the same origin

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8080;
const LM_STUDIO_URL = process.env.LOCAL_AI_URL || 'http://192.168.1.214:1234';

console.log(`[Proxy] Starting server on port ${PORT}`);
console.log(`[Proxy] LM Studio URL: ${LM_STUDIO_URL}`);

const server = http.createServer(async (req, res) => {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = req.url;
  console.log(`[Proxy] ${req.method} ${url}`);

  // Proxy API requests to LM Studio
  if (url.startsWith('/v1/') || url.startsWith('/api/')) {
    try {
      const targetUrl = new URL(url, LM_STUDIO_URL);
      console.log(`[Proxy] Forwarding to: ${targetUrl.toString()}`);

      const options = {
        hostname: targetUrl.hostname,
        port: targetUrl.port,
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: {
          ...req.headers,
          host: targetUrl.host,
        },
      };

      const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        console.error('[Proxy] Request error:', err.message);
        res.writeHead(502);
        res.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
      });

      req.pipe(proxyReq);
    } catch (err) {
      console.error('[Proxy] Error:', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal Server Error', message: err.message }));
    }
    return;
  }

  // Serve static files
  let filePath = path.join(__dirname, 'dist', url === '/' ? 'index.html' : url);
  
  // Security check - prevent directory traversal
  if (!filePath.startsWith(path.join(__dirname, 'dist'))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  const contentType = contentTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // For SPA routing, serve index.html for unknown paths
        fs.readFile(path.join(__dirname, 'dist', 'index.html'), (err, content) => {
          if (err) {
            res.writeHead(500);
            res.end('Server Error');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Proxy] Server running at http://localhost:${PORT}`);
  console.log(`[Proxy] API requests will be proxied to: ${LM_STUDIO_URL}`);
});
