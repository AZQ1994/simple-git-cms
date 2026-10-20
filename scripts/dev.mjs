// Build the editor and serve dist/ locally: npm run dev
// Needs a dist/config.json — it is copied from config.example.json on the first run so the page
// loads; point `repo` at a real repository to actually edit anything.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT || 4173);

const built = spawnSync(process.execPath, [path.join(root, 'scripts/build.mjs')], { stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status ?? 1);

const config = path.join(dist, 'config.json');
if (!fs.existsSync(config)) {
  fs.copyFileSync(path.join(dist, 'config.example.json'), config);
  console.log('dist/config.json created from the example — edit it to point at your repository.');
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

http
  .createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
    // Resolve inside dist/ so a crafted path can't read the rest of the disk
    const file = path.resolve(dist, rel || 'index.html');
    const target = file.startsWith(dist + path.sep) || file === dist ? (fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file, 'index.html') : file) : null;

    if (!target || !fs.existsSync(target)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(target).pipe(res);
  })
  .listen(port, () => console.log(`Simple Git CMS editor on http://localhost:${port}`));
