// The site side of the preview, as a site of your own would write it: take what the editor posts
// and render it with the page's own layout. The import is integrations/preview-client.js, copied
// in unchanged at build time.
import { connectPreview } from './preview-client.js';

const $ = (id) => document.getElementById(id);

const embedded = connectPreview((article) => {
  document.title = article.title || 'Preview';
  $('title').textContent = article.title || '';
  $('date').textContent = article.date ? new Date(article.date).toLocaleDateString(document.documentElement.lang || 'en', { dateStyle: 'long' }) : '';
  $('tags').replaceChildren(
    ...(article.tags ?? []).map((tag) => {
      const li = document.createElement('li');
      li.textContent = tag;
      return li;
    }),
  );
  $('body').innerHTML = article.html;
});

if (!embedded) $('standalone').hidden = false;
