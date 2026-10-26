#!/usr/bin/env node
// Renders this site into www/dist/: one HTML page per language, plus the stylesheet, the icon and
// the screenshot the README already uses. No dependencies — `node www/build.mjs`.
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, copy, pages } from './content.mjs';
import { page } from './template.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const root = join(here, '..');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const { lang, path } of pages) {
  const file = join(dist, path, 'index.html');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, page(lang, copy[lang]));
  console.log(`  /${path}`);
}

await cp(join(here, 'assets'), dist, { recursive: true });
await cp(join(root, 'docs', 'screenshot.png'), join(dist, 'screenshot.png'));

// A missing page lands in English rather than on a Cloudflare error page
await writeFile(
  join(dist, '404.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found — Simple Git CMS</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/site.css"></head><body><section class="hero"><div class="wrap"><p class="kicker">404</p><h1>That page isn’t here.</h1><p class="lead">It may have moved, or never existed.</p><p class="actions"><a class="btn btn-primary" href="/">Simple Git CMS</a></p></div></section></body></html>\n`,
);

// ---------- the demo ----------
//
// The same editor `npm run build` produces, installed the way the README tells anyone else to
// install it, with a service worker standing in for GitHub. Nothing in src/ knows about this.
const demo = join(dist, 'demo');
const run = (script, args = []) => execFileSync(process.execPath, [join(root, 'scripts', script), ...args], { stdio: 'inherit' });

run('build.mjs');
run('install.mjs', [join(demo, 'app')]);

await cp(join(here, 'demo'), demo, { recursive: true, force: true });
await mkdir(join(demo, 'preview'), { recursive: true });
for (const [from, to] of [
  ['preview.html', 'preview/index.html'],
  ['preview.css', 'preview/preview.css'],
  ['preview-page.js', 'preview/preview-page.js'],
  ['templates.js', 'preview/templates.js'],
]) {
  await cp(join(demo, from), join(demo, to));
  await rm(join(demo, from));
}
await cp(join(root, 'integrations', 'preview-client.js'), join(demo, 'preview', 'preview-client.js'));

// The demo bar is added to the editor's page here rather than in the editor's own HTML
const editorPage = join(demo, 'app', 'index.html');
const html = await readFile(editorPage, 'utf8');
await writeFile(
  editorPage,
  html
    .replace('</body>', '    <link rel="stylesheet" href="../banner.css" />\n    <script src="../banner.js"></script>\n  </body>'),
);

await writeFile(
  join(demo, 'app', 'config.json'),
  `${JSON.stringify(
    {
      title: 'Simple Git CMS demo',
      siteName: 'Demo site',
      logo: '../logo.svg',
      repo: 'example/site',
      branch: 'main',
      siteUrl: SITE,
      timeZone: 'Asia/Tokyo',
      auth: { base: '/demo/auth' },
      collections: [{ name: 'news', label: 'news', dir: 'site/content/news', url: '/demo/preview/', imageField: 'image', preview: '/demo/preview/' }],
      media: { dir: 'site/public/uploads', url: '/uploads', maxWidth: 1600, quality: 0.82 },
      blocks: [
        {
          tag: 'aside',
          name: 'notice',
          label: 'Notice',
          attrs: { class: 'notice' },
          fields: [{ name: 'text', from: 'content', label: 'Text', multiline: true, placeholder: 'Applications close on 20 February.' }],
        },
        { tag: 'table', label: 'Advanced table', edit: 'table' },
      ],
      deploy: { skipCiForDrafts: true },
    },
    null,
    2,
  )}\n`,
);

console.log('built www/dist');
