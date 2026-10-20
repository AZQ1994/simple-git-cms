// Simple Git CMS 预览页的接收端：放在网站的一个页面里（例如 /news/preview/），编辑器把它嵌在 iframe 里，
// 把正在编辑的文章（标题、日期、标签、正文 HTML、还没上传的图片）发过来，页面用网站自己的排版显示。
//
//   import { connectPreview } from './preview-client.js';
//   connectPreview((article) => { /* 把 article.title / date / tags / html 填进页面 */ });
//
// article.html 里还没上传的图片已经换成了本页可用的 blob: 地址。
// 只接受本站同域名、或 allowOrigins 里列出的编辑器发来的消息（编辑器放在别的域名时要列出）。
export function connectPreview(onUpdate, { allowOrigins = [] } = {}) {
  const allowed = new Set([location.origin, ...allowOrigins]);
  const urls = new Map(); // 图片路径 → blob: 地址；每次更新沿用，避免图片闪烁
  addEventListener('message', (e) => {
    if (e.source !== parent || !allowed.has(e.origin) || e.data?.type !== 'simple-git-cms-preview') return;
    const { article, html, images = {} } = e.data;
    for (const [src, url] of urls) {
      if (!(images[src] instanceof Blob)) {
        URL.revokeObjectURL(url);
        urls.delete(src);
      }
    }
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    for (const img of tpl.content.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      if (!(images[src] instanceof Blob)) continue;
      if (!urls.has(src)) urls.set(src, URL.createObjectURL(images[src]));
      img.src = urls.get(src);
    }
    const div = document.createElement('div');
    div.append(tpl.content);
    onUpdate({ ...article, html: div.innerHTML });
  });
  if (parent !== window) parent.postMessage({ type: 'simple-git-cms-preview-ready' }, '*');
  return parent !== window;
}
