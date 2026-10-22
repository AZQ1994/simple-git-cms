#!/usr/bin/env node
// Copy the built editor into a site's static directory. From the npm package it is
//   npx simple-git-cms install <target>
// and from a clone of the repository, after a build, node scripts/install.mjs <target>.
// Only the editor's own files are overwritten; config.json and the logo already there are left
// alone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args[0] === 'install') args.shift(); // `simple-git-cms install <target>` reads better than without
const target = args[0];
if (!target) {
  console.error('Usage: simple-git-cms install <editor directory inside the site, e.g. public/editor>');
  process.exit(1);
}
const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'app.js'))) {
  console.error('Run npm run build first.');
  process.exit(1);
}
fs.mkdirSync(target, { recursive: true });
for (const f of ['index.html', 'app.js', 'app.css', 'preview.js', 'cropper.js', 'cropper.css', 'favicon.svg', 'VERSION', 'config.example.json', 'config.schema.json']) fs.copyFileSync(path.join(dist, f), path.join(target, f));
const hasConfig = fs.existsSync(path.join(target, 'config.json'));
console.log(`Installed Simple Git CMS ${fs.readFileSync(path.join(dist, 'VERSION'), 'utf8').trim()} to ${target}`);
if (!hasConfig) console.log('No config.json yet — write one modelled on config.example.json, and add a logo.png.');
