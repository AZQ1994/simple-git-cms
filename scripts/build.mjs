// 打包编辑器到 dist/：index.html、app.js、app.css、config.example.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

await build({
  entryPoints: [path.join(root, 'src/app.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2022',
  outfile: path.join(out, 'app.js'),
  legalComments: 'none',
  banner: { js: `/* Simple Git CMS ${version} */` },
});
const css = [path.join(root, 'node_modules/cropperjs/dist/cropper.min.css'), path.join(root, 'public/app.css')]
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');
fs.writeFileSync(path.join(out, 'app.css'), css);
for (const f of ['index.html', 'config.example.json']) fs.copyFileSync(path.join(root, 'public', f), path.join(out, f));
fs.writeFileSync(path.join(out, 'VERSION'), `${version}\n`);
console.log(`Simple Git CMS ${version} → dist/ (app.js ${(fs.statSync(path.join(out, 'app.js')).size / 1024).toFixed(0)}KB)`);
