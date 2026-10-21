#!/usr/bin/env node
// Renders this site into www/dist/: one HTML page per language, plus the stylesheet, the icon and
// the screenshot the README already uses. No dependencies — `node www/build.mjs`.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copy, pages } from './content.mjs';
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

console.log('built www/dist');
