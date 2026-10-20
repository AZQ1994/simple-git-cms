// 打包编辑器到 dist/：index.html、app.js、app.css、config.example.json
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
fs.copyFileSync(path.join(root, 'public/config.example.json'), path.join(out, 'config.example.json'));
// app.js / app.css 网址带上内容指纹：网站给静态文件设了缓存时，升级后浏览器也会立刻用新版本
const hash = (f) => crypto.createHash('sha1').update(fs.readFileSync(path.join(out, f))).digest('hex').slice(0, 10);
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8')
  .replace('./app.css"', `./app.css?v=${hash('app.css')}"`)
  .replace('./app.js"', `./app.js?v=${hash('app.js')}"`);
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'VERSION'), `${version}\n`);
console.log(`Simple Git CMS ${version} → dist/ (app.js ${(fs.statSync(path.join(out, 'app.js')).size / 1024).toFixed(0)}KB)`);
