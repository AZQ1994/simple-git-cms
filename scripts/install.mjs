// Copy the built editor into a site's static directory: node scripts/install.mjs <target>
// Only the editor's own files are overwritten; config.json and the logo already there are left
// alone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/install.mjs <editor directory inside the site, e.g. ../site/public/editor>');
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
