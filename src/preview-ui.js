// The preview pane. The site's own preview page (integrations/preview-client.js) sits in an
// iframe; the editor posts what is being edited over, and the site renders it in its own layout.
import { $, toast } from './dom.js';
import { CONFIG, on, pending, state } from './store.js';
import { collect } from './doc.js';
import { t } from './i18n/index.js';
import { excerpt } from './article.js';

let previewReady = false;
let renderMarkdown; // preview.js is a separate bundle, fetched the first time a preview opens

function loadRenderer() {
  if (renderMarkdown) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = __PREVIEW_JS__; // eslint-disable-line no-undef
    s.onload = () => {
      renderMarkdown = window.simpleGitCmsPreview.renderMarkdown;
      resolve();
    };
    s.onerror = () => reject(new Error(t('preview.loadFailed')));
    document.head.append(s);
  });
}

/** Markdown to HTML the way the site does it, loading the renderer first if it isn't yet. */
export async function renderBody(markdown) {
  await loadRenderer();
  return renderMarkdown(markdown);
}

const previewFrame = $('#preview-frame');
// An earlier version opened from the history, shown instead of what is being edited, and what to
// do when the preview closes again
let fixed = null;
let onClose = null;

// Keep the preview up to date while editing, after a pause so every keystroke doesn't reconvert
let previewTimer;
function queuePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(sendPreview, 400);
}
on('doc:changed', queuePreview);

function sendPreview() {
  if (!previewReady || !renderMarkdown || $('#preview').hidden || (!state.current && !fixed)) return;
  const a = fixed ?? collect();
  const images = {};
  for (const [src, p] of pending) images[src] = p.blob;
  // The cover and the rest of the frontmatter go too: a site may show either on the article page,
  // and a preview without them would not be the page that goes live
  const field = CONFIG.collection.imageField;
  const article = {
    title: a.title,
    date: a.date,
    tags: a.tags,
    description: a.description || excerpt(a.body), // what the file will say
    image: (field && a.extra?.[field]) || null,
    fields: a.extra,
  };
  previewFrame.contentWindow.postMessage(
    { type: 'simple-git-cms-preview', article, html: renderMarkdown(a.body), images },
    new URL(previewFrame.src).origin,
  );
}

/**
 * Open the preview: of the article being edited, or of `article` — an earlier version from the
 * history, which `note` then says. `closed` is called when it is closed again.
 */
export async function openPreview(article = null, { note, closed } = {}) {
  try {
    await loadRenderer();
  } catch (e) {
    return toast(e.message, 'error');
  }
  // As with images: use this origin when the editor shares the site's domain or is running
  // locally, and the site's address otherwise
  const url = new URL(CONFIG.preview.url, CONFIG.assetBase || location.origin).href;
  fixed = article;
  onClose = closed ?? null;
  $('#preview-hint').textContent = article ? note : t('preview.hint');
  $('#preview').hidden = false;
  if (previewFrame.src !== url) {
    previewReady = false;
    previewFrame.src = url;
  } else {
    sendPreview();
  }
}

addEventListener('message', (e) => {
  if (e.source !== previewFrame.contentWindow || e.data?.type !== 'simple-git-cms-preview-ready') return;
  previewReady = true;
  sendPreview();
});
function closePreview() {
  $('#preview').hidden = true;
  fixed = null;
  const then = onClose;
  onClose = null;
  then?.();
}

$('#btn-preview').addEventListener('click', () => openPreview());
$('#preview-close').addEventListener('click', closePreview);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#preview').hidden) closePreview();
});
$('#preview-size').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $('#preview-size').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  $('.preview-stage').classList.toggle('phone', b.dataset.size === 'phone');
});
