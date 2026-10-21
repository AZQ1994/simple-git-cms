// The article being edited: its form fields and tags, opening, saving, publishing and deleting,
// the status bar, and the deployment indicator.
import { $, busy, toast } from './dom.js';
import { addPending, CONFIG, displaySrc, emit, fmtDateInput, fmtDateTime, mediaRepoPath, on, pending, state, store } from './store.js';
import { dropDraft, getDraft, putDraft } from './recover.js';
import { editor, setBody, toMarkdown } from './editor.js';
import { compressImage, newImagePath, openCropper } from './images.js';
import { renderList, setSidebar } from './list.js';
import { ConflictError } from './github.js';
import { icons } from './icons.js';
import { t } from './i18n/index.js';

// ---------- Tags ----------

let tags = [];

function renderTags() {
  const box = $('#tags');
  box.querySelectorAll('.chip').forEach((el) => el.remove());
  const input = $('#tag-input');
  for (const tag of tags) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = tag;
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.setAttribute('aria-label', t('doc.removeTag', { tag }));
    x.addEventListener('click', () => {
      tags = tags.filter((v) => v !== tag);
      renderTags();
      markDirty();
    });
    chip.append(x);
    box.insertBefore(chip, input);
  }
  input.placeholder = tags.length ? '' : t('doc.addTag');
}

function addTag(v) {
  v = v.trim();
  if (!v || tags.includes(v)) return;
  tags.push(v);
  renderTags();
  markDirty();
}

$('#tag-input').addEventListener('keydown', (e) => {
  if (['Enter', ',', '，', '、'].includes(e.key)) {
    e.preventDefault();
    addTag(e.target.value);
    e.target.value = '';
  } else if (e.key === 'Backspace' && !e.target.value && tags.length) {
    tags.pop();
    renderTags();
    markDirty();
  }
});
$('#tag-input').addEventListener('input', (e) => {
  if (state.articles.some((a) => a.tags.includes(e.target.value))) {
    addTag(e.target.value);
    e.target.value = '';
  }
});
// Text typed but left without pressing Enter still counts as a tag
$('#tag-input').addEventListener('blur', (e) => {
  if (e.target.value.trim()) {
    addTag(e.target.value);
    e.target.value = '';
  }
});
$('#tags').addEventListener('click', (e) => e.target === e.currentTarget && $('#tag-input').focus());

// ---------- Opening ----------

function markDirty() {
  if (state.loading || !state.current) return;
  state.dirty = true;
  updateBar();
  emit('doc:changed');
}
on('doc:edited', markDirty);
on('doc:changed', queueDraft);

// ---------- Unsaved work ----------
//
// Everything typed is copied into the browser a moment later, so closing the tab or losing the
// browser doesn't lose the article. The copy goes the moment it is committed, or the moment
// someone says they don't want it.

const draftKey = (id) => `${CONFIG.repo}/${CONFIG.collection.dir}/${id ?? 'new'}`;

/** Whether an article still points at an image — in the body, or as its cover. An image that has
 * been inserted and then deleted again is not committed. */
const isUsed = (article, path) => article.body.includes(`(${path}`) || (coverField() && article.extra?.[coverField()] === path);

let draftTimer;
function queueDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(keepDraft, 1200);
}

async function keepDraft() {
  if (!state.current || !state.dirty) return;
  const article = collect();
  const images = [];
  for (const [path, p] of pending) {
    if (!p.uploaded && isUsed(article, path)) images.push({ path, blob: p.blob });
  }
  await putDraft(draftKey(state.current.id), { article, images, savedAt: Date.now() });
}

function forgetDraft(id) {
  clearTimeout(draftTimer);
  dropDraft(draftKey(id));
}

/** What was kept for this article, if it says anything the saved version doesn't. */
async function unsavedDraft(id, saved) {
  const kept = await getDraft(draftKey(id));
  if (!kept?.article) return null;
  const same = (a) => JSON.stringify([a.title, a.description, a.date, a.tags, a.body, a.extra]);
  return saved && same(kept.article) === same(saved) ? null : kept;
}

/** Put a kept draft back on screen, images and all. Nothing is committed by this. */
function restoreDraft(kept) {
  for (const { path, blob } of kept.images ?? []) {
    if (!pending.has(path)) pending.set(path, { blob, url: URL.createObjectURL(blob), uploaded: false });
  }
  load(kept.article);
  state.dirty = true;
  updateBar();
  renderList();
  toast(t('recover.restored'));
}

/** Offer the kept draft, and take no for an answer — permanently. */
async function offerDraft(id, saved, prompt = 'recover.prompt') {
  const kept = await unsavedDraft(id, saved);
  if (!kept) return;
  if (confirm(t(prompt, { when: fmtDateTime(kept.savedAt) }))) restoreDraft(kept);
  else forgetDraft(id);
}

export function confirmDiscard() {
  if (!state.dirty) return true;
  if (!confirm(t('save.discardConfirm'))) return false;
  forgetDraft(state.current?.id); // they said they don't want it; don't offer it back later
  return true;
}
addEventListener('beforeunload', (e) => {
  if (state.dirty) e.preventDefault();
});

function autosizeTitle() {
  const el = $('#f-title');
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// Which article is open lives in the address bar, so reloading the page comes back to it — and
// the address is a link to that article for anyone else who can sign in.
const idInUrl = () => new URLSearchParams(location.search).get('id');

function rememberOpen(id) {
  history.replaceState(null, '', id ? `${location.pathname}?id=${encodeURIComponent(id)}` : location.pathname);
}

/** Reopen whatever was open before the reload. Called once the article list is in. */
export function restoreOpen() {
  const id = idInUrl();
  if (!id) return offerDraft(null, null, 'recover.promptNew'); // an article being written last time
  if (state.articles.some((a) => a.id === id)) openArticle(id);
  else rememberOpen(null); // it was deleted, or this is someone else's link to another repository
}

function load(a) {
  state.loading = true;
  state.current = a;
  $('#f-title').value = a.title;
  $('#f-date').value = fmtDateInput(a.date);
  $('#f-desc').value = a.description;
  tags = [...a.tags];
  renderTags();
  cover = coverField() ? (typeof a.extra?.[coverField()] === 'string' ? a.extra[coverField()] : null) : null;
  renderCover();
  setBody(a.body);
  updateDescHint();
  $('#empty').hidden = true;
  $('#doc').hidden = false;
  state.loading = false;
  state.dirty = !a.id;
  $('#img-bar').hidden = true;
  $('#table-bar').hidden = true;
  updateBar();
  renderList();
  autosizeTitle();
  $('.main').scrollTop = 0;
  rememberOpen(a.id);
}

function openArticle(id) {
  if (state.current?.id === id) return setSidebar(false);
  if (!confirmDiscard()) return;
  const a = state.articles.find((x) => x.id === id);
  if (a) {
    load(structuredClone({ ...a, extra: a.extra }));
    offerDraft(id, a);
  }
  setSidebar(false);
}
on('article:open', openArticle);

$('#new-article').addEventListener('click', () => {
  if (!confirmDiscard()) return;
  load({ id: null, sha: null, title: '', description: '', date: new Date().toISOString(), tags: [], draft: true, extra: {}, body: '' });
  setSidebar(false);
  $('#f-title').focus();
});

// ---------- Cover image ----------
//
// The site uses it as the article's thumbnail and its share image, so it lives in the frontmatter
// rather than in the body. Which field it goes in is up to config.collection.imageField; when
// that is empty there is no cover and no control.

let cover = null; // the path on the site, or null

const coverField = () => CONFIG.collection.imageField;

function renderCover() {
  const field = coverField();
  // A field the editor did not write — Astro's { src, alt } object, say, or a path relative to the
  // article — is left exactly as it is, and the control stays out of the way
  const ours = !field || typeof (state.current?.extra?.[field] ?? '') === 'string';
  $('#cover').hidden = !field || !ours;
  if ($('#cover').hidden) return;
  $('#cover-img').hidden = !cover;
  if (cover) $('#cover-img').src = displaySrc(cover);
  $('#cover-empty').hidden = Boolean(cover);
  $('#cover-acts').hidden = !cover;
}

function setCover(path) {
  cover = path;
  renderCover();
  markDirty();
}

// A file chooser of its own, so a cover never lands in the body by mistake
const pickCover = () => {
  $('#cover-input').value = '';
  $('#cover-input').click();
};
$('#cover-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) busy(t('img.processingOne'), async () => setCover(addPending(newImagePath(), await compressImage(file))));
});

$('#cover-pick').addEventListener('click', pickCover);
$('#cover-acts').addEventListener('click', async (e) => {
  const act = e.target.closest('[data-cover]')?.dataset.cover;
  if (!act || !cover) return;
  if (act === 'remove') return setCover(null);
  if (act === 'replace') return pickCover();
  if (act === 'crop') {
    const blob = await openCropper(displaySrc(cover));
    if (blob) setCover(addPending(newImagePath(), blob));
  }
});

// ---------- Saving ----------

export function collect() {
  const date = $('#f-date').value;
  const keepTime = state.current.date && fmtDateInput(state.current.date) === date;
  const extra = { ...state.current.extra };
  // Assigning to a field that is already there keeps its place in the frontmatter
  if (coverField()) {
    if (cover) extra[coverField()] = cover;
    else delete extra[coverField()];
  }
  return {
    ...state.current,
    extra,
    title: $('#f-title').value.trim(),
    description: $('#f-desc').value.trim(),
    tags: [...tags],
    // When only the date changed, store midday UTC so every zone within ±11 hours shows that day
    date: keepTime ? state.current.date : new Date(`${date}T12:00:00Z`).toISOString(),
    body: toMarkdown(),
  };
}

function validate(a) {
  if (!a.title) return t('validate.title');
  if (!a.body.trim()) return t('validate.body');
  const externalImage = new RegExp(`!\\[[^\\]]*\\]\\((?!${CONFIG.media.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/)[^)]+\\)`);
  if (externalImage.test(a.body)) return t('validate.externalImage');
  return null;
}

/** Save. `draft` is the draft state to end up in. Returns whether it worked. */
async function save({ draft, force = false, label = t('save.saving') }) {
  const article = { ...collect(), draft };
  const err = validate(article);
  if (err) {
    toast(err, 'error');
    return false;
  }
  const wasLive = state.current.id && !state.current.draft;
  const keyBefore = state.current.id; // a new article is kept under 'new' until it has one
  const images = [];
  for (const [path, p] of pending) {
    if (!p.uploaded && isUsed(article, path)) {
      images.push({ url: path, path: mediaRepoPath(path), bytes: new Uint8Array(await p.blob.arrayBuffer()) });
    }
  }
  // A draft saved as a draft doesn't affect the site, so skip the deployment
  const skipCi = CONFIG.deploy.skipCiForDrafts && draft && !wasLive;
  const action = !state.current.id ? 'create' : draft && wasLive ? 'unpublish' : !draft && !wasLive ? 'publish' : 'update';
  const message = `${skipCi ? '[skip ci] ' : ''}${t('commit.article', { verb: t(`verb.${action}`), title: article.title })}`;

  return (
    (await busy(label, async () => {
      try {
        const r = await store.saveArticle(article, { baseSha: state.current.sha, images, message, force });
        for (const img of images) pending.get(img.url).uploaded = true;
        const saved = { ...article, id: r.id, sha: r.sha };
        const i = state.articles.findIndex((a) => a.id === r.id);
        if (i >= 0) state.articles[i] = saved;
        else state.articles.unshift(saved);
        state.articles.sort((a, b) => String(b.date).localeCompare(String(a.date)));
        state.current = saved;
        state.dirty = false;
        forgetDraft(keyBefore);
        if (saved.id !== keyBefore) forgetDraft(saved.id);
        rememberOpen(saved.id);
        updateBar();
        renderList();
        toast(skipCi ? t('save.draftSaved') : t(`done.${action}`));
        if (!skipCi) watchDeploy(r.commit);
        return true;
      } catch (e) {
        if (e instanceof ConflictError) {
          resolveConflict(e.theirs, draft);
          return false;
        }
        throw e;
      }
    })) ?? false
  );
}

$('#btn-save').addEventListener('click', () => save({ draft: state.current.draft || !state.current.id }));
$('#btn-publish').addEventListener('click', () => {
  const live = state.current.id && !state.current.draft;
  if (!live && !confirm(t('save.publishConfirm'))) return;
  save({ draft: false, label: live ? t('save.updating') : t('save.publishing') });
});
$('#btn-unpublish').addEventListener('click', () => {
  if (confirm(t('save.unpublishConfirm'))) save({ draft: true, label: t('save.unpublishing') });
});
$('#btn-delete').addEventListener('click', async () => {
  if (!confirm(t('save.deleteConfirm', { title: state.current.title || t('list.untitled') }))) return;
  await busy(t('save.deleting'), async () => {
    await store.saveArticle(state.current, { baseSha: state.current.sha, deleteArticle: true, message: `${CONFIG.deploy.skipCiForDrafts ? '[skip ci] ' : ''}${t('commit.delete', { title: state.current.title })}` });
    state.articles = state.articles.filter((a) => a.id !== state.current.id);
    forgetDraft(state.current.id);
    state.current = null;
    state.dirty = false;
    rememberOpen(null);
    $('#doc').hidden = true;
    $('#empty').hidden = false;
    updateBar();
    renderList();
    toast(t('save.deleted'));
  });
});

function resolveConflict(theirs, draft) {
  const modal = $('#conflict-modal');
  $('#conflict-text').textContent = theirs ? t('conflict.theirsText', { title: theirs.title }) : t('conflict.deletedText');
  modal.querySelector('[data-conflict="theirs"]').hidden = !theirs;
  modal.hidden = false;
  modal.onclick = (e) => {
    const b = e.target.closest('[data-conflict]');
    if (!b) return;
    modal.hidden = true;
    if (b.dataset.conflict === 'theirs') {
      const i = state.articles.findIndex((a) => a.id === theirs.id);
      if (i >= 0) state.articles[i] = theirs;
      state.dirty = false;
      load(theirs);
    } else if (b.dataset.conflict === 'mine') {
      save({ draft, force: true });
    }
  };
}

// ---------- Status bar ----------

export function updateBar() {
  const a = state.current;
  const has = Boolean(a);
  $('#btn-save').hidden = !has || (a.id && !a.draft); // a published article only offers Update
  $('#btn-publish').hidden = !has;
  $('#btn-preview').hidden = !has || !CONFIG.preview?.url;
  $('#btn-unpublish').hidden = !has || !a.id || a.draft;
  $('#btn-delete').hidden = !has || !a.id || !a.draft;
  $('#view-live').hidden = !has || !a.id || a.draft;
  if (!has) {
    $('#status').textContent = '';
    return;
  }
  const live = a.id && !a.draft;
  $('#btn-publish').textContent = live ? t('bar.update') : t('bar.publish');
  $('#btn-publish').disabled = live && !state.dirty;
  $('#view-live').href = CONFIG.siteUrl + CONFIG.collection.url.replace('{id}', a.id);
  const s = $('#status');
  s.className = `status ${live ? 'live' : 'draft'}`;
  s.textContent = !a.id ? t('status.new') : live ? t('status.live') : t('status.draft');
  if (state.dirty) s.textContent += ` · ${t('status.unsaved')}`;
}

let deployTimer;
function watchDeploy(commit) {
  clearTimeout(deployTimer);
  const el = $('#deploy');
  el.hidden = false;
  el.className = 'deploy pending';
  el.textContent = t('deploy.pending');
  const started = Date.now();
  const tick = async () => {
    let s = 'pending';
    try {
      s = await store.deployStatus(commit);
    } catch {
      //
    }
    if (s === 'success') {
      el.className = 'deploy ok';
      el.innerHTML = icons.check;
      el.append(t('deploy.success'));
      deployTimer = setTimeout(() => (el.hidden = true), 8000);
    } else if (s === 'failure') {
      el.className = 'deploy fail';
      el.textContent = t('deploy.failure');
    } else if (s === 'superseded') {
      el.hidden = true; // superseded by a later save, which shows its own progress
    } else if (Date.now() - started < 10 * 60_000) {
      deployTimer = setTimeout(tick, 6000);
    } else {
      el.hidden = true;
    }
  };
  deployTimer = setTimeout(tick, 8000);
}

// ---------- Form fields ----------

for (const id of ['#f-title', '#f-date', '#f-desc']) $(id).addEventListener('input', markDirty);
$('#f-title').addEventListener('input', autosizeTitle);
$('#f-title').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    editor.commands.focus('start');
  }
});

function updateDescHint() {
  const n = $('#f-desc').value.trim().length;
  $('#desc-hint').textContent = n ? t('doc.descCount', { n }) : t('doc.descAuto');
}
$('#f-desc').addEventListener('input', updateDescHint);

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && state.current) {
    e.preventDefault();
    const live = state.current.id && !state.current.draft;
    save({ draft: !live, label: live ? t('save.updating') : t('save.saving') });
  }
});

on('relabel', () => {
  renderTags();
  updateBar();
  updateDescHint();
});
