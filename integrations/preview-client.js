// Receiving end of the Simple Git CMS preview. Put it on a page of your own site (say /news/preview/)
// that uses your normal article layout. The editor embeds that page in an iframe and posts the
// article being edited — title, date, tags, description, cover image, the rest of the frontmatter,
// body HTML, and any images not uploaded yet — so the preview is rendered by the site itself rather
// than by the editor.
//
//   import { connectPreview } from './preview-client.js';
//   connectPreview((article) => { /* put article.title / date / tags / image / html on the page */ });
//
// article.image is the cover (null when there is none, or no imageField is configured) and
// article.fields every frontmatter field the editor has no input of its own for, as the file has
// them. Images not uploaded yet — in article.html, and the cover — are already rewritten to blob:
// URLs this page can load. Only messages from the same origin are accepted, plus any origin listed in
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
    // An image not uploaded yet, as an address this page can load; anything else as it is
    const local = (src) => {
      if (!(images[src] instanceof Blob)) return src;
      if (!urls.has(src)) urls.set(src, URL.createObjectURL(images[src]));
      return urls.get(src);
    };
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    for (const img of tpl.content.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      if (images[src] instanceof Blob) img.src = local(src);
    }
    const div = document.createElement('div');
    div.append(tpl.content);
    onUpdate({ ...article, image: article.image ? local(article.image) : null, html: div.innerHTML });
  });
  if (parent !== window) parent.postMessage({ type: 'simple-git-cms-preview-ready' }, '*');
  return parent !== window;
}
