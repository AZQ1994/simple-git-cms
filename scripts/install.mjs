#!/usr/bin/env node
// Copy the built editor into a site's static directory. From the npm package it is
//   npx simple-git-cms install <target>
// and from a clone of the repository, after a build, node scripts/install.mjs <target>.
// Only the editor's own files are overwritten; config.json and the logo already there are left
// alone — but a config.json an earlier version wrote is pointed out, since the editor would only
// say so once someone opened it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UPGRADING = 'https://github.com/AZQ1994/simple-git-cms#2-write-configjson';

/**
 * What a config.json from before 1.0 still has to change, one line each; none for a current one.
 * The editor checks everything else itself when it starts.
 * @param {unknown} config The parsed config.json.
 * @returns {string[]}
 */
export function upgradeNotes(config) {
  if (config === null || typeof config !== 'object') return [];
  const notes = [];
  if ('collection' in config) notes.push('"collection" is now "collections", a list: "collections": [{ …the same settings… }]');
  if ('preview' in config) notes.push('"preview": { "url": … } moves into each collection, as "preview": "/news/preview/"');
  return notes;
}

function install(args) {
  if (args[0] === 'install') args.shift(); // `simple-git-cms install <target>` reads better than without
  const target = args[0];
  if (!target) {
    console.error('Usage: simple-git-cms install <editor directory inside the site, e.g. public/editor>');
    process.exit(1);
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(path.join(dist, 'app.js'))) {
    console.error('Run npm run build first.');
    process.exit(1);
  }
  fs.mkdirSync(target, { recursive: true });
  for (const f of ['index.html', 'app.js', 'app.css', 'preview.js', 'cropper.js', 'cropper.css', 'favicon.svg', 'VERSION', 'config.example.json', 'config.schema.json']) fs.copyFileSync(path.join(dist, f), path.join(target, f));
  const version = fs.readFileSync(path.join(dist, 'VERSION'), 'utf8').trim();
  console.log(`Installed Simple Git CMS ${version} to ${target}`);

  const configPath = path.join(target, 'config.json');
  if (!fs.existsSync(configPath)) {
    console.log('No config.json yet — write one modelled on config.example.json, and add a logo.png.');
    return;
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return; // not JSON at all: the editor says so, with the parser's own message
  }
  const notes = upgradeNotes(config);
  if (!notes.length) return;
  console.warn(`\n${configPath} is written for an earlier version; ${version} won't open until it is changed:`);
  for (const note of notes) console.warn(`  - ${note}`);
  console.warn(`See ${UPGRADING} (Upgrading from 0.x).`);
}

// Run as a command, not when a test imports it. npx runs it through a link, hence realpath.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) install(process.argv.slice(2));
