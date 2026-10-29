// The sidebar: the article list, its search box and filters.
import { $ } from './dom.js';
import { COLLECTION, emit, fmtDate, on, state } from './store.js';
import { t } from './i18n/index.js';
import { display } from './fields.js';

/** The values of the fields config.json asks to see in the list (`list: true`), as they are shown. */
const listed = (a) =>
  (COLLECTION?.fields ?? [])
    .filter((f) => f.list)
    .map((f) => display(f, a.extra?.[f.name]))
    .filter(Boolean);

export function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const counts = { all: state.articles.length, live: 0, draft: 0 };
  for (const a of state.articles) counts[a.draft ? 'draft' : 'live']++;
  for (const k of Object.keys(counts)) $(`#count-${k}`).textContent = counts[k];

  const items = state.articles.filter(
    (a) =>
      (state.filter === 'all' || (state.filter === 'draft') === a.draft) &&
      (!q || [a.title, ...a.tags, ...listed(a)].some((text) => text.toLowerCase().includes(q))),
  );
  const ul = $('#list');
  ul.replaceChildren(
    ...items.map((a) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'item' + (state.current?.id === a.id ? ' active' : '');
      btn.innerHTML = `<span class="item-title"></span><span class="item-meta"><span class="dot ${a.draft ? 'draft' : 'live'}"></span><span class="item-state"></span><span>${fmtDate(a.date)}</span></span>`;
      btn.querySelector('.item-title').textContent = a.title || t('list.untitled');
      btn.querySelector('.item-state').textContent = a.draft ? t('status.draft') : t('status.live');
      for (const text of listed(a)) btn.querySelector('.item-meta').append(Object.assign(document.createElement('span'), { className: 'item-field', textContent: text }));
      btn.addEventListener('click', () => emit('article:open', a.id));
      li.append(btn);
      return li;
    }),
  );
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'list-empty';
    li.textContent = t('list.empty');
    ul.replaceChildren(li);
  }
  // Until every body is in, the list, the counts and the search are about what has arrived so far
  if (state.pending) {
    const li = document.createElement('li');
    li.className = 'list-more';
    li.textContent = t('list.more', { n: state.pending });
    ul.append(li);
  }

  const allTags = [...new Set(state.articles.flatMap((a) => a.tags))];
  $('#tag-options').replaceChildren(
    ...allTags.map((tag) => {
      const o = document.createElement('option');
      o.value = tag;
      return o;
    }),
  );
}

export function setSidebar(open) {
  document.body.classList.toggle('side-open', open);
}

$('#search').addEventListener('input', renderList);
$('#filter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  state.filter = b.dataset.filter;
  $('#filter').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  renderList();
});
$('#open-list').addEventListener('click', () => setSidebar(true));
$('#scrim').addEventListener('click', () => setSidebar(false));

// Its width: drag the right edge (or focus it and use the arrow keys), double-click for the default.
// Kept per browser; on phones the sidebar is a drawer and the handle is hidden.
const WIDTH_KEY = 'simple-git-cms-side';
const MIN_WIDTH = 220;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 300;
const handle = $('#side-resize');

function setWidth(px, save = true) {
  // The stylesheet also keeps it narrower than the window leaves room for
  const w = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, px)));
  $('#app').style.setProperty('--side', `${w}px`);
  handle.setAttribute('aria-valuenow', w);
  if (save) localStorage.setItem(WIDTH_KEY, w);
}

handle.setAttribute('aria-valuemin', MIN_WIDTH);
handle.setAttribute('aria-valuemax', MAX_WIDTH);
setWidth(Number(localStorage.getItem(WIDTH_KEY)) || DEFAULT_WIDTH, false);

handle.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  handle.setPointerCapture(e.pointerId);
  const left = $('#sidebar').getBoundingClientRect().left;
  const move = (ev) => setWidth(ev.clientX - left, false);
  const up = () => {
    handle.removeEventListener('pointermove', move);
    document.body.classList.remove('resizing');
    setWidth($('#sidebar').getBoundingClientRect().width);
  };
  document.body.classList.add('resizing');
  handle.addEventListener('pointermove', move);
  handle.addEventListener('lostpointercapture', up, { once: true });
});
handle.addEventListener('dblclick', () => {
  localStorage.removeItem(WIDTH_KEY);
  setWidth(DEFAULT_WIDTH, false);
});
handle.addEventListener('keydown', (e) => {
  const step = { ArrowLeft: -16, ArrowRight: 16 }[e.key];
  if (!step) return;
  e.preventDefault();
  setWidth($('#sidebar').getBoundingClientRect().width + step);
});

on('relabel', renderList);
