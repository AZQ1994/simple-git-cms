// Bundle the editor into dist/: index.html, app.js, preview.js, cropper.js, app.css and the
// example config.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const hash = (f) => crypto.createHash('sha1').update(fs.readFileSync(path.join(out, f))).digest('hex').slice(0, 10);

// The Markdown conversion behind the preview is sizeable, so it is bundled on its own and only
// fetched when someone opens the preview
await build({
  entryPoints: [path.join(root, 'src/preview.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'simpleGitCmsPreview',
  target: 'es2022',
  outfile: path.join(out, 'preview.js'),
  legalComments: 'eof', // keep the dependencies' license notices in the bundle, as MIT and friends require
});

// Cropper.js is bundled separately too, and only fetched when someone crops an image
await build({
  entryPoints: [path.join(root, 'src/cropper.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'simpleGitCmsCropper',
  target: 'es2022',
  outfile: path.join(out, 'cropper.js'),
  legalComments: 'eof', // keep the dependencies' license notices in the bundle, as MIT and friends require
});
fs.copyFileSync(path.join(root, 'node_modules/cropperjs/dist/cropper.min.css'), path.join(out, 'cropper.css'));

await build({
  entryPoints: [path.join(root, 'src/app.js')],
  define: {
    __PREVIEW_JS__: JSON.stringify(`./preview.js?v=${hash('preview.js')}`),
    __CROPPER_JS__: JSON.stringify(`./cropper.js?v=${hash('cropper.js')}`),
    __CROPPER_CSS__: JSON.stringify(`./cropper.css?v=${hash('cropper.css')}`),
  },
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2022',
  outfile: path.join(out, 'app.js'),
  legalComments: 'eof', // keep the dependencies' license notices in the bundle, as MIT and friends require
  banner: { js: `/* Simple Git CMS ${version} */` },
});
fs.copyFileSync(path.join(root, 'public/app.css'), path.join(out, 'app.css'));
fs.copyFileSync(path.join(root, 'public/config.example.json'), path.join(out, 'config.example.json'));
fs.copyFileSync(path.join(root, 'public/favicon.svg'), path.join(out, 'favicon.svg'));
fs.copyFileSync(path.join(root, 'public/config.schema.json'), path.join(out, 'config.schema.json'));
// Fingerprint the app.js / app.css URLs, so a browser picks up a new version immediately even
// when the site caches static files
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8')
  .replace('./app.css"', `./app.css?v=${hash('app.css')}"`)
  .replace('./app.js"', `./app.js?v=${hash('app.js')}"`);
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'VERSION'), `${version}\n`);
const kb = (f) => `${f} ${(fs.statSync(path.join(out, f)).size / 1024).toFixed(0)}KB`;
console.log(`Simple Git CMS ${version} → dist/ (${kb('app.js')}, ${kb('preview.js')}, ${kb('cropper.js')})`);
