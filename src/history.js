// The history of the article that is open: every commit that changed it, and the article as each
// one left it. Every save is already a commit, so the versions are all in the repository; this
// reads them back, and restoring one puts it in the editor to be saved like any other change.
//
// A version is drawn the way the site would draw it, in a frame sandboxed so that nothing in it
// runs: its text comes from the repository, HTML and all, and the editor's page holds the GitHub
// token.
import { $, busy, toast } from './dom.js';
import { COLLECTION, displaySrc, fmtDate, fmtDateTime, state, store } from './store.js';
import { openPreview, renderBody } from './preview-ui.js';
import { restoreChanges, restoreVersion } from './doc.js';
import { t } from './i18n/index.js';

const modal = $('#history-modal');
const list = $('#history-list');
const frame = $('#history-frame');
const previewBtn = modal.querySelector('[data-history="preview"]');
const restoreBtn = modal.querySelector('[data-history="restore"]');

let commits = [];
let articleId = null;
let shown = null; // the commit on screen
const versions = new Map(); // commit sha -> the article as it left it (null: deleted there)

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const when = (c) => (c.date ? fmtDateTime(Date.parse(c.date)) : c.sha.slice(0, 7));

async function openHistory() {
  const a = state.current;
  if (!a?.id) return;
  const found = await busy(t('history.loading'), () => store.history(a.id));
  if (!found) return; // the request failed, and busy() has said so
  if (articleId !== a.id) versions.clear();
  articleId = a.id;
  commits = found;
  renderList();
  modal.hidden = false;
  if (commits.length) show(commits[0]);
  else showText(t('history.empty'));
}

function renderList() {
  list.replaceChildren(
    ...commits.map((c, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'history-item';
      b.dataset.sha = c.sha;
      b.innerHTML = `<span class="history-when">${esc(when(c))}${i === 0 ? ` <span class="history-tag">${esc(t('history.latest'))}</span>` : ''}</span><span class="history-msg">${esc(c.message)}</span><span class="history-who">${esc(c.author)}</span>`;
      li.append(b);
      return li;
    }),
  );
}

async function show(c) {
  shown = c;
  for (const b of list.querySelectorAll('.history-item')) b.classList.toggle('on', b.dataset.sha === c.sha);
  $('#history-what').textContent = t('history.viewing', { when: when(c) });
  previewBtn.hidden = true;
  restoreBtn.hidden = true;
  showText(t('history.loading'));
  let article;
  try {
    article = versions.has(c.sha) ? versions.get(c.sha) : await store.getArticle(articleId, c.sha);
    versions.set(c.sha, article);
  } catch (e) {
    if (shown === c) showText(e.message || String(e));
    return;
  }
  if (shown !== c) return; // another version was clicked meanwhile
  if (!article) return showText(t('history.deleted'));
  let html;
  try {
    html = await renderBody(article.body);
  } catch (e) {
    return toast(e.message, 'error');
  }
  if (shown !== c) return;
  frame.srcdoc = page(article, html);
  previewBtn.hidden = !COLLECTION.preview;
  // Not offered for the version that is already there, with nothing unsaved on top of it
  restoreBtn.hidden = !restoreChanges(article);
}

function showText(text) {
  frame.srcdoc = page(null, `<p class="note">${esc(text)}</p>`);
}

/** A whole page for the frame: the version's title, date, tags and cover over its body, in the
 * interface's own colours. The frame inherits the editor's policy, which allows no <base>, so the
 * site's paths (/uploads/…) are pointed at the site here, the way the editor shows its own images. */
function page(article, html) {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const field = COLLECTION.imageField;
  const cover = article && field && typeof article.extra?.[field] === 'string' ? article.extra[field] : null;
  const head = article
    ? `<h1>${esc(article.title) || esc(t('list.untitled'))}</h1>
       <p class="meta">${esc(article.date ? fmtDate(article.date) : '')}${article.draft ? ` · ${esc(t('status.draft'))}` : ''}${article.tags.map((tag) => ` <span class="tag">${esc(tag)}</span>`).join('')}</p>
       ${cover ? `<img class="cover" src="${esc(cover)}" alt="">` : ''}`
    : '';
  // Parsing builds an inert document: nothing in it runs or loads until it is in the frame
  const doc = new DOMParser().parseFromString(`<body>${head}${html}</body>`, 'text/html');
  for (const el of doc.querySelectorAll('[src]')) el.setAttribute('src', displaySrc(el.getAttribute('src')));
  for (const a of doc.querySelectorAll('a[href]')) a.target = '_blank';
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  body { margin: 0; padding: 28px 32px 60px; font: 16px/1.8 ${v('--font')}; color: ${v('--text')}; background: ${v('--bg')}; overflow-wrap: anywhere; }
  h1 { margin: 0 0 6px; font-size: 26px; line-height: 1.35; color: ${v('--ink')}; }
  h2, h3 { color: ${v('--ink')}; line-height: 1.4; }
  a { color: ${v('--navy')}; }
  img, video, iframe { max-width: 100%; height: auto; }
  figure { margin: 1.2em 0; } figcaption { font-size: 13px; color: ${v('--muted')}; text-align: center; }
  table { border-collapse: collapse; } th, td { border: 1px solid ${v('--line-strong')}; padding: 4px 10px; }
  pre { overflow-x: auto; padding: 12px 14px; border-radius: 8px; background: ${v('--bg-side')}; }
  code { font-size: .9em; } blockquote { margin: 1em 0; padding-left: 14px; border-left: 3px solid ${v('--line-strong')}; color: ${v('--muted')}; }
  .meta { margin: 0 0 18px; font-size: 13px; color: ${v('--muted')}; }
  .tag { display: inline-block; margin-left: 4px; padding: 0 8px; border-radius: 999px; background: ${v('--track')}; }
  .cover { display: block; margin: 0 0 20px; border-radius: 8px; }
  .note { color: ${v('--muted')}; text-align: center; margin-top: 40px; }
  @media (max-width: 600px) { body { padding: 20px 16px 40px; } }
</style></head>${doc.body.outerHTML}</html>`;
}

function close() {
  modal.hidden = true;
  shown = null;
  frame.srcdoc = '';
}

$('#btn-history').addEventListener('click', openHistory);
list.addEventListener('click', (e) => {
  const b = e.target.closest('.history-item');
  const c = b && commits.find((x) => x.sha === b.dataset.sha);
  if (c && c !== shown) show(c);
});
modal.addEventListener('click', (e) => {
  if (e.target === modal || e.target.closest('[data-history="close"]')) return close();
  if (e.target.closest('[data-history="restore"]') && shown && versions.get(shown.sha)) {
    if (restoreVersion(versions.get(shown.sha), { sha: shown.sha, when: when(shown) })) close();
    return;
  }
  if (e.target.closest('[data-history="preview"]') && shown && versions.get(shown.sha)) {
    // The preview sits under this window, so this one steps aside until the preview is closed —
    // and comes back only after that, so the Escape that closed the preview doesn't close it too
    modal.hidden = true;
    openPreview(versions.get(shown.sha), { note: t('history.previewNote', { when: when(shown) }), closed: () => setTimeout(() => (modal.hidden = false)) });
  }
});
addEventListener('keydown', (e) => e.key === 'Escape' && !modal.hidden && close());
