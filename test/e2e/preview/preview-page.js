// The site's preview page, as small as one can be: it shows the cover, the title and the body, and
// keeps the last thing the editor sent where the test can read it.
import { connectPreview } from './preview-client.js';

connectPreview((article) => {
  window.received = article;
  const cover = document.getElementById('cover');
  cover.hidden = !article.image;
  if (article.image) cover.src = article.image;
  document.getElementById('title').textContent = article.title;
  document.getElementById('body').innerHTML = article.html;
});
