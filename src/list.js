// The sidebar: the article list, its search box and filters.
import { $ } from './dom.js';
import { emit, fmtDate, on, state } from './store.js';
import { t } from './i18n/index.js';

export function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const counts = { all: state.articles.length, live: 0, draft: 0 };
  for (const a of state.articles) counts[a.draft ? 'draft' : 'live']++;
  for (const k of Object.keys(counts)) $(`#count-${k}`).textContent = counts[k];

  const items = state.articles.filter(
    (a) =>
      (state.filter === 'all' || (state.filter === 'draft') === a.draft) &&
      (!q || a.title.toLowerCase().includes(q) || a.tags.some((tag) => tag.toLowerCase().includes(q))),
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

on('relabel', renderList);
