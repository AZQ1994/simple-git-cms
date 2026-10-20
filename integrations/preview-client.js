// Receiving end of the Simple Git CMS preview. Put it on a page of your own site (say /news/preview/)
// that uses your normal article layout. The editor embeds that page in an iframe and posts the
// article being edited — title, date, tags, body HTML, and any images not uploaded yet — so the
// preview is rendered by the site itself rather than by the editor.
//
//   import { connectPreview } from './preview-client.js';
//   connectPreview((article) => { /* put article.title / date / tags / html on the page */ });
//
// Images in article.html that have not been uploaded yet are already rewritten to blob: URLs this
// page can load. Only messages from the same origin are accepted, plus any origin listed in
// allowOrigins — needed when the editor is hosted on a different domain than the site.
export function connectPreview(onUpdate, { allowOrigins = [] } = {}) {
  const allowed = new Set([location.origin, ...allowOrigins]);
  const urls = new Map(); // image path -> blob: URL, reused between updates so images don't flicker
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
