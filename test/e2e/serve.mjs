// Serves the built editor (dist/) on a port of the operating system's choosing, with a config.json
// written for the test rather than for a real site.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

// A 1x1 transparent PNG, so the test's site has a logo the way a real install does
const LOGO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

export async function startEditor({ root, config, headers = {} }) {
  const body = JSON.stringify(config);
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    if (path === '/logo.png') {
      res.writeHead(200, { ...headers, 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      return res.end(LOGO);
    }
    if (path === '/config.json') {
      res.writeHead(200, { ...headers, 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
      return res.end(body);
    }
    const file = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }
    res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
