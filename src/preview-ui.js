// The preview pane. The site's own preview page (integrations/preview-client.js) sits in an
// iframe; the editor posts what is being edited over, and the site renders it in its own layout.
import { $, toast } from './dom.js';
import { CONFIG, on, pending, state } from './store.js';
import { collect } from './doc.js';
import { t } from './i18n/index.js';

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

const previewFrame = $('#preview-frame');

// Keep the preview up to date while editing, after a pause so every keystroke doesn't reconvert
let previewTimer;
function queuePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(sendPreview, 400);
}
on('doc:changed', queuePreview);

function sendPreview() {
  if (!previewReady || !renderMarkdown || $('#preview').hidden || !state.current) return;
  const a = collect();
  const images = {};
  for (const [src, p] of pending) images[src] = p.blob;
  previewFrame.contentWindow.postMessage(
    { type: 'simple-git-cms-preview', article: { title: a.title, date: a.date, tags: a.tags, description: a.description }, html: renderMarkdown(a.body), images },
    new URL(previewFrame.src).origin,
  );
}

async function openPreview() {
  try {
    await loadRenderer();
  } catch (e) {
    return toast(e.message, 'error');
  }
  // As with images: use this origin when the editor shares the site's domain or is running
  // locally, and the site's address otherwise
  const url = new URL(CONFIG.preview.url, CONFIG.assetBase || location.origin).href;
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
$('#btn-preview').addEventListener('click', openPreview);
$('#preview-close').addEventListener('click', () => ($('#preview').hidden = true));
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#preview').hidden) $('#preview').hidden = true;
});
$('#preview-size').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $('#preview-size').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  $('.preview-stage').classList.toggle('phone', b.dataset.size === 'phone');
});
