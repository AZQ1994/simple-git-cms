// 打包编辑器到 dist/：index.html、app.js、preview.js、app.css、config.example.json
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

// 预览用的 Markdown 转换比较大，单独打包，点「预览」时才加载
await build({
  entryPoints: [path.join(root, 'src/preview.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'simpleGitCmsPreview',
  target: 'es2022',
  outfile: path.join(out, 'preview.js'),
  legalComments: 'eof', // 把依赖的许可证声明留在打包结果末尾（MIT 等许可证要求保留）
});

// 裁剪窗口用的 Cropper.js 也单独打包，点「裁剪」时才加载
await build({
  entryPoints: [path.join(root, 'src/cropper.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'simpleGitCmsCropper',
  target: 'es2022',
  outfile: path.join(out, 'cropper.js'),
  legalComments: 'eof', // 把依赖的许可证声明留在打包结果末尾（MIT 等许可证要求保留）
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
  legalComments: 'eof', // 把依赖的许可证声明留在打包结果末尾（MIT 等许可证要求保留）
  banner: { js: `/* Simple Git CMS ${version} */` },
});
fs.copyFileSync(path.join(root, 'public/app.css'), path.join(out, 'app.css'));
fs.copyFileSync(path.join(root, 'public/config.example.json'), path.join(out, 'config.example.json'));
// app.js / app.css 网址带上内容指纹：网站给静态文件设了缓存时，升级后浏览器也会立刻用新版本
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8')
  .replace('./app.css"', `./app.css?v=${hash('app.css')}"`)
  .replace('./app.js"', `./app.js?v=${hash('app.js')}"`);
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'VERSION'), `${version}\n`);
const kb = (f) => `${f} ${(fs.statSync(path.join(out, f)).size / 1024).toFixed(0)}KB`;
console.log(`Simple Git CMS ${version} → dist/ (${kb('app.js')}, ${kb('preview.js')}, ${kb('cropper.js')})`);
