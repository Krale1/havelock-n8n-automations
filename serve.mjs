/**
 * Local server for the Havelock Ops Console.
 *
 * Two jobs, nothing else:
 *   1. Serve the files in this folder (the console, plus each project's
 *      test data so the one-click demo pickers can load them).
 *   2. Forward anything under /webhook/ or /webhook-test/ to n8n.
 *
 * The forwarding is the whole point. It puts the page and the webhooks on a
 * single origin, so the browser never makes a cross-origin request and CORS
 * never applies. n8n's webhook nodes cannot answer a CORS preflight in this
 * build - an OPTIONS request returns 500 - so the fix is to never need one.
 *
 * No dependencies. No build step.
 *
 *   node serve.mjs            # http://localhost:8000
 *   node serve.mjs 9000       # different port
 */

import { createServer, request as httpRequest } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, normalize, extname, sep } from 'node:path';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8000);
const N8N_HOST = process.env.N8N_HOST || '127.0.0.1';
const N8N_PORT = Number(process.env.N8N_PORT || 5678);

const PROXY_PREFIXES = ['/webhook/', '/webhook-test/'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

function proxyToN8n(req, res) {
  const upstream = httpRequest(
    {
      hostname: N8N_HOST,
      port: N8N_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `${N8N_HOST}:${N8N_PORT}` },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );

  upstream.on('error', (err) => {
    // Nearly always "n8n isn't running" or "the workflow isn't active".
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        error: 'Could not reach n8n',
        detail: err.message,
        hint: `Is n8n running on http://${N8N_HOST}:${N8N_PORT} and is the workflow Active?`,
      }),
    );
  });

  req.pipe(upstream);
}

/**
 * GET  /mock-pricing              -> { variant }
 * POST /mock-pricing  { "variant": "price" }
 *
 * Swaps the mock competitor pricing page between its four prepared variants,
 * so a demo can stage a cosmetic edit and then a real price change without
 * alt-tabbing to an editor mid-demo.
 *
 * Deliberately narrow: it copies one of four known files over one known file.
 * It is not a general file-write endpoint.
 */
const LIVE_PAGE = join(ROOT, 'mock-competitor-pricing.html');
const VARIANT_DIR = join(ROOT, '03-competitor-monitoring', 'test-data', 'pages');
const VARIANTS = ['baseline', 'cosmetic', 'price', 'feature'];

async function currentVariant() {
  try {
    const html = await readFile(LIVE_PAGE, 'utf8');
    const m = html.match(/name="x-demo-variant"\s+content="([a-z]+)"/i);
    return m ? m[1] : 'unknown';
  } catch {
    return 'unreadable';
  }
}

async function mockPricing(req, res) {
  const json = (code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  if (req.method === 'GET') return json(200, { variant: await currentVariant() });

  const chunks = [];
  for await (const c of req) chunks.push(c);

  let variant;
  try {
    variant = String(JSON.parse(Buffer.concat(chunks).toString('utf8')).variant || '').toLowerCase().trim();
  } catch {
    return json(400, { error: 'Body must be JSON like {"variant":"price"}' });
  }

  if (!VARIANTS.includes(variant)) {
    return json(400, { error: `variant must be one of: ${VARIANTS.join(', ')}` });
  }

  try {
    await writeFile(LIVE_PAGE, await readFile(join(VARIANT_DIR, `${variant}.html`), 'utf8'));
    json(200, { ok: true, variant });
  } catch (err) {
    json(500, { error: 'Could not swap the pricing page', detail: err.message });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/') pathname = '/ops-console/index.html';

  // Keep the request inside ROOT - normalize() collapses any ../ segments.
  const target = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!target.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    return res.end('Forbidden');
  }

  let filePath = target;
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = join(filePath, 'index.html');
      await stat(filePath);
    }
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end(`Not found: ${pathname}`);
  }

  res.writeHead(200, {
    'content-type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(res);
}

createServer((req, res) => {
  if (PROXY_PREFIXES.some((p) => req.url.startsWith(p))) return proxyToN8n(req, res);

  if (req.url.split('?')[0] === '/mock-pricing' && (req.method === 'GET' || req.method === 'POST')) {
    return mockPricing(req, res).catch((err) => {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('mock-pricing error: ' + err.message);
    });
  }

  serveStatic(req, res).catch((err) => {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Server error: ' + err.message);
  });
}).listen(PORT, () => {
  console.log('');
  console.log('  Havelock demo');
  console.log('');
  console.log(`  internal  http://localhost:${PORT}/ops-console/`);
  console.log(`  support   http://localhost:${PORT}/customer-support.html`);
  console.log(`  signup    http://localhost:${PORT}/customer-signup.html`);
  console.log('');
  console.log(`  serving   ${ROOT}`);
  console.log(`  proxying  /webhook/*  →  http://${N8N_HOST}:${N8N_PORT}`);
  console.log('');
  console.log('  Every workflow you want to use must be Published in n8n.  Ctrl+C to stop.');
  console.log('');
});
