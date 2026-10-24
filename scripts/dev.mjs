// Build the editor and serve dist/ locally: npm run dev
// Needs a dist/config.json — it is copied from config.example.json on the first run so the page
// loads; point `repo` at a real repository to actually edit anything.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { localApi, localMedia } from './local-api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT || 4173);

// Which repository on this machine to edit. `npm run dev ../my-site` points the editor at that
// checkout's files; with nothing given it is the repository the editor itself lives in, which is
// what an install inside a site looks like.
const site = path.resolve(process.argv[2] ?? root);

// Every build empties dist/, so the config to develop against lives at the repository root as
// dev.config.json (gitignored) and is copied in afterwards. Edit that file, not dist/config.json.
const devConfig = path.join(root, 'dev.config.json');
const fresh = !fs.existsSync(devConfig);

const built = spawnSync(process.execPath, [path.join(root, 'scripts/build.mjs')], { stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status ?? 1);

if (fresh) fs.copyFileSync(path.join(dist, 'config.example.json'), devConfig);
fs.copyFileSync(devConfig, path.join(dist, 'config.json'));
if (fresh) console.log('dev.config.json created from the example — edit it to point at your repository.');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

// The editor asks this server who it is before it asks GitHub; answering means editing the files
// in `site` instead, with a save becoming a commit there (scripts/local-api.mjs)
const config = JSON.parse(fs.readFileSync(devConfig, 'utf8'));
const api = localApi({
  root: site,
  contentDirs: (config.collections ?? []).map((c) => c.dir ?? ''),
  mediaDir: config.media?.dir ?? '',
  timeZone: config.timeZone,
});
const media = localMedia({ root: site, mediaDir: config.media?.dir ?? '', mediaUrl: config.media?.url ?? '/uploads' });

http
  .createServer(async (req, res) => {
    if (await api(req, res)) return;
    if (media(req, res)) return;
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
  .listen(port, () => {
    console.log(`Simple Git CMS editor on http://localhost:${port}`);
    console.log(`editing the files in ${site} — a save is a commit there, pushing is yours to do`);
  });
