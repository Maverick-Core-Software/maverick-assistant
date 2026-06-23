import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 3012);
const mccUrl = process.env.MCC_URL || 'http://localhost:3000';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff':  'font/woff',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // Proxy all /api/* to MCC server — no CORS needed (same-origin from client POV)
  if (url.pathname.startsWith('/api/')) {
    try {
      const upstream = new URL(url.pathname + url.search, mccUrl);
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      let body = hasBody ? await readBody(req) : undefined;

      // Mode allowlist + employee channel enforcement
      if (url.pathname === '/api/chat' && body) {
        try {
          const parsed = JSON.parse(body.toString());
          const ALLOWED = new Set(['ask', 'estimate', 'ops', 'estimate-ready', 'agent']);
          if (!ALLOWED.has(parsed.mode ?? 'ask')) {
            res.writeHead(403, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'Mode not available in this app.' }));
            return;
          }
        } catch {} // non-JSON bodies pass through to MCC to handle
      }

      const headers = { ...req.headers };
      delete headers.host;

      const proxyRes = await fetch(upstream.toString(), {
        method: req.method,
        headers,
        body,
        ...(hasBody ? { duplex: 'half' } : {}),
      });

      const resHeaders = {};
      for (const [k, v] of proxyRes.headers) resHeaders[k] = v;
      // strip transfer-encoding so node can handle chunked itself
      delete resHeaders['transfer-encoding'];
      res.writeHead(proxyRes.status, resHeaders);

      if (proxyRes.body) {
        const reader = proxyRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (err) {
      if (!res.headersSent) res.writeHead(502);
      res.end(`Proxy error: ${err.message}`);
    }
    return;
  }

  // Serve static files from dist/
  let filePath = path.join(distDir, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!fs.existsSync(filePath)) {
    // SPA fallback
    filePath = path.join(distDir, 'index.html');
  }

  try {
    const ext = path.extname(filePath);
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Maverick Assistant → http://0.0.0.0:${port}  (proxying /api → ${mccUrl})`);
});
