#!/usr/bin/env node
// Run the auth relay as a plain HTTP server, for hosts without an edge runtime (your own VPS,
// Docker, a Raspberry Pi, or just localhost while developing):
//
//   GITHUB_CLIENT_ID=… GITHUB_CLIENT_SECRET=… ALLOWED_DOMAINS=example.com node auth/server.js
//
// Works on Node 18+, Bun and Deno (`deno run --allow-net --allow-env auth/server.js`).
// Put it behind a TLS-terminating reverse proxy: the OAuth callback must be https.
import { createServer } from 'node:http';
import handler from './index.js';

const port = Number(process.env.PORT || 8788);

/** Collect the request body; the only POST this handles is a small JSON payload. */
const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? `localhost:${port}`}`);
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: hasBody ? await readBody(req) : undefined,
    });

    const out = await handler.fetch(request, process.env);
    const headers = Object.fromEntries(out.headers);
    // A single response can set several cookies, and `Object.fromEntries` would keep only one
    delete headers['set-cookie'];
    const cookies = out.headers.getSetCookie?.() ?? [];
    if (cookies.length) headers['set-cookie'] = cookies;

    res.writeHead(out.status, headers);
    res.end(Buffer.from(await out.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal error');
  }
});

server.listen(port, () => {
  console.log(`Simple Git CMS auth relay listening on http://localhost:${port}`);
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    console.warn('GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are not set — sign-in will fail.');
  }
  if (!process.env.ALLOWED_DOMAINS) {
    console.warn('ALLOWED_DOMAINS is not set — every domain is allowed to use this relay.');
  }
});
