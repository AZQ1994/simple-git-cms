// 把打包好的编辑器复制到网站的静态目录：node scripts/install.mjs <目标目录>
// 只覆盖编辑器本身的文件；目标目录里的 config.json 和 logo 保持不动。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (!target) {
  console.error('用法：node scripts/install.mjs <网站静态目录下的编辑器目录，如 ../site/public/editor>');
  process.exit(1);
}
const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'app.js'))) {
  console.error('请先 npm run build');
  process.exit(1);
}
fs.mkdirSync(target, { recursive: true });
for (const f of ['index.html', 'app.js', 'app.css', 'preview.js', 'VERSION', 'config.example.json']) fs.copyFileSync(path.join(dist, f), path.join(target, f));
const hasConfig = fs.existsSync(path.join(target, 'config.json'));
console.log(`已安装 Simple Git CMS ${fs.readFileSync(path.join(dist, 'VERSION'), 'utf8').trim()} → ${target}`);
if (!hasConfig) console.log('还没有 config.json：参照 config.example.json 写一份，再放一张 logo.png');
