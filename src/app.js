// Simple Git CMS 编辑器：静态页面，在浏览器里直接通过 GitHub API 读写仓库里的 Markdown 文章。
// 站点相关的设置都在同目录的 config.json（见 public/config.example.json）。
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Paragraph from '@tiptap/extension-paragraph';
import { Markdown } from '@tiptap/markdown';
import { NodeSelection } from '@tiptap/pm/state';
import { GitHubStore, ConflictError, AuthError } from './github.js';
import { excerpt } from './article.js';
import { compressImage, newImagePath, openCropper, setImageOptions } from './images.js';
import { icons } from './icons.js';
import { applyI18n, getLocale, locales, rememberLocale, resolveLocale, setLocale, t } from './i18n/index.js';

let CONFIG; // 启动时从 ./config.json 读入
const TOKEN_KEY = 'simple-git-cms-token';
const REFRESH_KEY = 'simple-git-cms-refresh'; // GitHub App 登录时才有，用来换新令牌
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
// 本地开发：可以把 GitHub API 指到本机的测试代理
const API_BASE = (isLocal && localStorage.getItem('simple-git-cms-api')) || 'https://api.github.com';

const $ = (s) => document.querySelector(s);
const fill = (root = document) => root.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icons[el.dataset.icon] ?? ''));
fill();

// ---------- 界面语言 ----------

// 先按使用者选过的语言 / 浏览器语言填一遍，config.json 读到后（可能带 lang）再填一次
let RAW = {}; // config.json 原文，切换语言时用来区分「配置写了」和「用默认值」
setLocale(resolveLocale());
applyI18n();

/** 切换语言后重新填一遍界面：静态文字、语言菜单，以及已经渲染出来的内容 */
function relabel() {
  applyI18n();
  for (const sel of document.querySelectorAll('.lang-select')) sel.value = getLocale();
  if (CONFIG) {
    CONFIG.title = RAW.title || t('config.defaultTitle');
    CONFIG.collection.label = RAW.collection?.label || t('config.defaultCollection');
    document.title = [CONFIG.title, CONFIG.siteName].filter(Boolean).join(' · ');
    document.querySelectorAll('[data-text="title"]').forEach((el) => (el.textContent = CONFIG.title));
    document.querySelectorAll('[data-text="collection"]').forEach((el) => (el.textContent = CONFIG.collection.label));
    $('#login-subtitle').textContent = t('login.subtitle', { collection: CONFIG.collection.label });
  }
  renderTags();
  renderList();
  updateBar();
  updateDescHint();
  onSelection();
}

for (const sel of document.querySelectorAll('.lang-select')) {
  sel.replaceChildren(
    ...Object.entries(locales).map(([code, dict]) => {
      const o = document.createElement('option');
      o.value = code;
      o.textContent = dict['lang.name'];
      return o;
    }),
  );
  sel.value = getLocale();
  sel.addEventListener('change', (e) => {
    setLocale(e.target.value);
    rememberLocale(e.target.value);
    relabel();
  });
}

// ---------- 提示 ----------

let toastTimer;
function toast(msg, kind = 'ok') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), kind === 'error' ? 6000 : 2800);
}

async function busy(text, fn) {
  $('#busy-text').textContent = text;
  $('#busy').hidden = false;
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthError) return logout(e.message);
    toast(e.message || String(e), 'error');
    console.error(e);
  } finally {
    $('#busy').hidden = true;
  }
}

// ---------- 状态 ----------

let store;
const state = {
  articles: [],
  filter: 'all',
  current: null, // 当前文章（最后一次保存 / 载入的版本）
  dirty: false,
  loading: false,
};
// 尚未提交的新图片：网站路径 → { blob, url }
const pending = new Map();
// 编辑器和网站不在同一个域名时，站内图片要加上网站地址才能显示
const displaySrc = (src) => pending.get(src)?.url ?? (src?.startsWith('/') && CONFIG.assetBase ? CONFIG.assetBase + src : src);
// 网站上的图片路径（/uploads/…）→ 仓库里的文件路径（public/uploads/…）
const mediaRepoPath = (url) => CONFIG.media.dir + url.slice(CONFIG.media.url.length);

// ---------- 登录 ----------

function showLogin(error) {
  $('#app').hidden = true;
  $('#login').hidden = false;
  const el = $('#login-error');
  el.textContent = error ?? '';
  el.hidden = !error;
}

function logout(reason) {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  state.dirty = false;
  showLogin(reason);
}

// 令牌过期时用 refresh_token 换新的。refresh_token 只能用一次，并发的请求共用同一次换取
let refreshing = null;
function refreshToken() {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return Promise.resolve(null);
  refreshing ??= fetch(`${CONFIG.auth.base}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data?.access_token) return null;
      localStorage.setItem(TOKEN_KEY, data.access_token);
      if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
      return data.access_token;
    })
    .finally(() => (refreshing = null));
  return refreshing;
}

$('#login-github').addEventListener('click', () => {
  const params = new URLSearchParams({
    provider: 'github',
    site_id: location.hostname,
    redirect_uri: location.origin + location.pathname,
  });
  location.href = `${CONFIG.auth.base}/auth?${params}`;
});

$('#token-form').addEventListener('submit', (e) => {
  e.preventDefault();
  localStorage.setItem(TOKEN_KEY, e.target.token.value.trim());
  localStorage.removeItem(REFRESH_KEY);
  e.target.reset();
  start();
});

$('#logout').addEventListener('click', () => {
  if (confirmDiscard()) logout();
});

// ---------- 文章列表 ----------

// 日期输入框要 ISO 的 YYYY-MM-DD；列表里按界面语言显示
const fmtDateInput = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: CONFIG.timeZone });
const fmtDate = (iso) => new Date(iso).toLocaleDateString(getLocale(), { timeZone: CONFIG.timeZone, dateStyle: 'medium' });

function renderList() {
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
      btn.addEventListener('click', () => openArticle(a.id));
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

$('#search').addEventListener('input', renderList);
$('#filter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  state.filter = b.dataset.filter;
  $('#filter').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  renderList();
});

function setSidebar(open) {
  document.body.classList.toggle('side-open', open);
}
$('#open-list').addEventListener('click', () => setSidebar(true));
$('#scrim').addEventListener('click', () => setSidebar(false));

// ---------- 编辑器 ----------

// 段落：默认会把「只有一张图的段落」拆成独立的图片节点（适用于块级图片）。
// 这里的图片是行内节点，必须保留段落本身，否则相邻的几段图片会被合并成一段（变成并排）。
const SiteParagraph = Paragraph.extend({
  parseMarkdown: (token, helpers) => {
    const tokens = token.tokens || [];
    const content = helpers.parseInline(tokens);
    const t = tokens[0];
    const isEmpty = tokens.length === 1 && t.type === 'text' && ['&nbsp;', '\u00a0'].some((v) => t.raw === v || t.text === v);
    return helpers.createNode('paragraph', undefined, isEmpty ? [] : content);
  },
  // 空段落（编辑时按回车留出的空行）存成 &nbsp;，网站上才会同样显示为空行。
  // 默认只有连续第二个空段落才会写出来，第一个会被吞掉
  renderMarkdown: (node, h) => (node.content?.length ? h.renderChildren(node.content) : '&nbsp;'),
});

// 图片：行内节点（同一段里的多张图在网站上并排显示）。title 作为图片说明。
const SiteImage = Image.extend({
  draggable: true,
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.className = 'img-node';
      const img = document.createElement('img');
      const cap = document.createElement('span');
      cap.className = 'img-cap';
      dom.append(img, cap);
      const render = (n) => {
        img.src = displaySrc(n.attrs.src);
        img.alt = n.attrs.alt ?? '';
        cap.textContent = n.attrs.title ?? '';
        cap.hidden = !n.attrs.title;
      };
      render(node);
      return {
        dom,
        update: (n) => (n.type.name === 'image' ? (render(n), true) : false),
        selectNode: () => dom.classList.add('selected'),
        deselectNode: () => dom.classList.remove('selected'),
      };
    };
  },
}).configure({ inline: true });

const editor = new Editor({
  element: $('#body'),
  extensions: [
    StarterKit.configure({ paragraph: false, heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true }, codeBlock: false, code: false }),
    SiteParagraph,
    SiteImage,
    Markdown,
  ],
  contentType: 'markdown',
  content: '',
  onUpdate: () => markDirty(),
  editorProps: {
    handlePaste: (_v, e) => insertFiles([...(e.clipboardData?.files ?? [])]),
    handleDrop: (_v, e) => insertFiles([...(e.dataTransfer?.files ?? [])]),
  },
});
editor.on('selectionUpdate', onSelection);
editor.on('transaction', () => {
  updateToolbar();
  positionImageBar();
});

// & 会被写成 &amp;（显示一样），存回文件时还原
// 开头和结尾的空行去掉（插入图片后总会留一个空段落）
const toMarkdown = () =>
  editor
    .getMarkdown()
    .replace(/&amp;(?![a-zA-Z]+;|#\d+;)/g, '&')
    .replace(/^(?:\s*&nbsp;\s*\n)+/, '')
    .replace(/(?:\n\s*&nbsp;\s*)+\s*$/, '\n');

const commands = {
  h2: (c) => c.toggleHeading({ level: 2 }),
  bold: (c) => c.toggleBold(),
  italic: (c) => c.toggleItalic(),
  bulletList: (c) => c.toggleBulletList(),
  orderedList: (c) => c.toggleOrderedList(),
  blockquote: (c) => c.toggleBlockquote(),
  undo: (c) => c.undo(),
  redo: (c) => c.redo(),
};
const active = {
  h2: () => editor.isActive('heading', { level: 2 }),
  bold: () => editor.isActive('bold'),
  italic: () => editor.isActive('italic'),
  bulletList: () => editor.isActive('bulletList'),
  orderedList: () => editor.isActive('orderedList'),
  blockquote: () => editor.isActive('blockquote'),
  link: () => editor.isActive('link'),
};

$('#toolbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cmd]');
  if (!b) return;
  const cmd = b.dataset.cmd;
  if (cmd === 'image') return pickFiles((files) => insertFiles(files));
  if (cmd === 'link') {
    const prev = editor.getAttributes('link').href ?? '';
    const href = prompt(t('toolbar.linkPrompt'), prev);
    if (href === null) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    return (href.trim() ? chain.setLink({ href: href.trim() }) : chain.unsetLink()).run();
  }
  commands[cmd](editor.chain().focus()).run();
});

function updateToolbar() {
  for (const b of document.querySelectorAll('#toolbar [data-cmd]')) b.classList.toggle('on', Boolean(active[b.dataset.cmd]?.()));
}

// ---------- 图片 ----------

let filePicked;
function pickFiles(cb, multiple = true) {
  const input = $('#file-input');
  input.multiple = multiple;
  filePicked = cb;
  input.click();
}
$('#file-input').addEventListener('change', (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) filePicked?.(files);
});

async function addPending(blob) {
  const path = newImagePath();
  pending.set(path, { blob, url: URL.createObjectURL(blob), uploaded: false });
  return path;
}

/** 插入图片：一张单独一段，多张放进同一段（并排） */
function insertFiles(files) {
  const imgs = files.filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) return false;
  busy(t('img.processing', { n: imgs.length }), async () => {
    const nodes = [];
    for (const f of imgs) nodes.push({ type: 'image', attrs: { src: await addPending(await compressImage(f)), alt: '' } });
    editor.chain().focus().insertContent([{ type: 'paragraph', content: nodes }, { type: 'paragraph' }]).run();
  });
  return true;
}

function selectedImage() {
  const sel = editor.state.selection;
  if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'image') return null;
  const $pos = editor.state.doc.resolve(sel.from);
  const para = $pos.parent;
  const paraPos = $pos.before();
  const onlyImages = (p) => p.type.name === 'paragraph' && p.childCount > 0 && p.content.content.every((c) => c.type.name === 'image' || (c.isText && !c.text.trim()));
  const index = $pos.index($pos.depth - 1);
  const container = $pos.node($pos.depth - 1);
  const prev = index > 0 ? container.child(index - 1) : null;
  return { node: sel.node, pos: sel.from, para, paraPos, inGroup: onlyImages(para) && para.childCount > 1, prev, prevIsImages: prev ? onlyImages(prev) : false };
}

function onSelection() {
  const img = selectedImage();
  $('#img-bar').hidden = !img;
  $('#caption-form').hidden = true;
  if (!img) return;
  const layout = $('#img-bar [data-img="layout"]');
  layout.hidden = !img.inGroup && !img.prevIsImages;
  layout.querySelector('.layout-label').textContent = img.inGroup ? t('img.layoutAlone') : t('img.layoutSide');
  layout.querySelector('[data-icon]').innerHTML = img.inGroup ? icons.rows : icons.columns;
  positionImageBar();
}

function positionImageBar() {
  const bar = $('#img-bar');
  const img = selectedImage();
  if (bar.hidden || !img) return;
  const dom = editor.view.nodeDOM(img.pos);
  if (!dom) return;
  const r = dom.getBoundingClientRect();
  const main = $('.main').getBoundingClientRect();
  const top = Math.max(r.top - main.top + $('.main').scrollTop - bar.offsetHeight - 10, $('.main').scrollTop + 64);
  bar.style.top = `${top}px`;
  bar.style.left = `${Math.min(Math.max(r.left - main.left + r.width / 2 - bar.offsetWidth / 2, 8), main.width - bar.offsetWidth - 8)}px`;
}
$('.main').addEventListener('scroll', positionImageBar);
addEventListener('resize', positionImageBar);

$('#img-bar').addEventListener('mousedown', (e) => e.target.closest('input') || e.preventDefault()); // 保持图片选中
$('#img-bar').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-img]');
  const img = selectedImage();
  if (!b || !img) return;
  const act = b.dataset.img;
  const setSrc = (src) => editor.chain().command(({ tr }) => (tr.setNodeMarkup(img.pos, undefined, { ...img.node.attrs, src }), true)).setNodeSelection(img.pos).run();

  if (act === 'delete') return editor.chain().focus().deleteSelection().run();
  if (act === 'caption') {
    const form = $('#caption-form');
    form.hidden = !form.hidden;
    $('#caption-input').value = img.node.attrs.title ?? '';
    if (!form.hidden) $('#caption-input').focus();
    return positionImageBar();
  }
  if (act === 'crop') {
    const blob = await openCropper(displaySrc(img.node.attrs.src));
    if (blob) setSrc(await addPending(blob));
    return;
  }
  if (act === 'replace') {
    return pickFiles(([f]) => busy(t('img.processingOne'), async () => setSrc(await addPending(await compressImage(f)))), false);
  }
  if (act === 'layout') {
    const { tr, schema } = editor.state;
    if (img.inGroup) {
      // 单独成一段：组里第一张放到组的前面，其余放到组的后面，保持原来的先后顺序
      const first = img.pos === img.paraPos + 1;
      tr.delete(img.pos, img.pos + 1);
      const at = first ? img.paraPos : img.paraPos + img.para.nodeSize - 1;
      tr.insert(at, schema.nodes.paragraph.create(null, img.node));
      tr.setSelection(NodeSelection.create(tr.doc, at + 1));
    } else if (img.prevIsImages) {
      // 放进上一段图片的末尾
      const prevEnd = img.paraPos - 1;
      if (img.para.childCount === 1) tr.delete(img.paraPos, img.paraPos + img.para.nodeSize);
      else tr.delete(img.pos, img.pos + 1);
      tr.insert(prevEnd, img.node);
      tr.setSelection(NodeSelection.create(tr.doc, prevEnd));
    }
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
  }
});

$('#caption-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const img = selectedImage();
  if (!img) return;
  // 说明写在 Markdown 的 "title" 里，去掉会破坏格式的双引号
  const title = $('#caption-input').value.trim().replace(/"/g, '”') || null;
  editor.chain().command(({ tr }) => (tr.setNodeMarkup(img.pos, undefined, { ...img.node.attrs, title }), true)).setNodeSelection(img.pos).run();
  $('#caption-form').hidden = true;
});

// ---------- 标签 ----------

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
// 输入了但没按回车就离开时，也当作一个标签
$('#tag-input').addEventListener('blur', (e) => {
  if (e.target.value.trim()) {
    addTag(e.target.value);
    e.target.value = '';
  }
});
$('#tags').addEventListener('click', (e) => e.target === e.currentTarget && $('#tag-input').focus());

// ---------- 打开 / 保存 ----------

function markDirty() {
  if (state.loading || !state.current) return;
  state.dirty = true;
  updateBar();
  queuePreview();
}

function confirmDiscard() {
  return !state.dirty || confirm(t('save.discardConfirm'));
}
addEventListener('beforeunload', (e) => {
  if (state.dirty) e.preventDefault();
});

function autosizeTitle() {
  const t = $('#f-title');
  t.style.height = 'auto';
  t.style.height = t.scrollHeight + 'px';
}

function load(a) {
  state.loading = true;
  state.current = a;
  $('#f-title').value = a.title;
  $('#f-date').value = fmtDateInput(a.date);
  $('#f-desc').value = a.description;
  tags = [...a.tags];
  renderTags();
  // 换文章时不记入撤销历史，避免「撤销」退回到上一篇
  editor.chain().setMeta('addToHistory', false).setContent(a.body, { contentType: 'markdown', emitUpdate: false }).run();
  updateDescHint();
  $('#empty').hidden = true;
  $('#doc').hidden = false;
  state.loading = false;
  state.dirty = !a.id;
  $('#img-bar').hidden = true;
  updateBar();
  renderList();
  autosizeTitle();
  $('.main').scrollTop = 0;
}

function openArticle(id) {
  if (state.current?.id === id) return setSidebar(false);
  if (!confirmDiscard()) return;
  const a = state.articles.find((x) => x.id === id);
  if (a) load(structuredClone({ ...a, extra: a.extra }));
  setSidebar(false);
}

$('#new-article').addEventListener('click', () => {
  if (!confirmDiscard()) return;
  load({ id: null, sha: null, title: '', description: '', date: new Date().toISOString(), tags: [], draft: true, extra: {}, body: '' });
  setSidebar(false);
  $('#f-title').focus();
});

function collect() {
  const date = $('#f-date').value;
  const keepTime = state.current.date && fmtDateInput(state.current.date) === date;
  return {
    ...state.current,
    title: $('#f-title').value.trim(),
    description: $('#f-desc').value.trim(),
    tags: [...tags],
    // 只改了日期时存成当天 UTC 中午，在 ±11 小时以内的时区显示都是同一天
    date: keepTime ? state.current.date : new Date(`${date}T12:00:00Z`).toISOString(),
    body: toMarkdown(),
  };
}

function validate(a) {
  if (!a.title) return t('validate.title');
  if (!a.body.trim()) return t('validate.body');
  if (!a.tags.length) return t('validate.tags');
  const externalImage = new RegExp(`!\\[[^\\]]*\\]\\((?!${CONFIG.media.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/)[^)]+\\)`);
  if (externalImage.test(a.body)) return t('validate.externalImage');
  return null;
}

/** 保存。draft 指定保存后的草稿状态；返回是否成功 */
async function save({ draft, force = false, label = t('save.saving') }) {
  const article = { ...collect(), draft };
  const err = validate(article);
  if (err) {
    toast(err, 'error');
    return false;
  }
  const wasLive = state.current.id && !state.current.draft;
  const images = [];
  for (const [path, p] of pending) {
    if (!p.uploaded && article.body.includes(`(${path}`)) {
      images.push({ url: path, path: mediaRepoPath(path), bytes: new Uint8Array(await p.blob.arrayBuffer()) });
    }
  }
  // 草稿改草稿不影响网站，跳过部署
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
    state.current = null;
    state.dirty = false;
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

// ---------- 状态栏 ----------

function updateBar() {
  const a = state.current;
  const has = Boolean(a);
  $('#btn-save').hidden = !has || (a.id && !a.draft); // 已发布的文章只有「更新」
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

// ---------- 预览 ----------
// 网站上的预览页（integrations/preview-client.js）嵌在 iframe 里，编辑器把当前内容发过去，用网站的排版显示

let previewReady = false;
let renderMarkdown; // preview.js 单独打包，第一次预览时加载

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

// 编辑时预览跟着更新（稍等一下再发，避免每敲一个字都重新转换一次 Markdown）
let previewTimer;
function queuePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(sendPreview, 400);
}

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
  // 和图片一样：编辑器和网站同域名、或在本地开发时用当前域名，否则用网站地址
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
      el.hidden = true; // 被之后的保存取代，由那次保存继续显示
    } else if (Date.now() - started < 10 * 60_000) {
      deployTimer = setTimeout(tick, 6000);
    } else {
      el.hidden = true;
    }
  };
  deployTimer = setTimeout(tick, 8000);
}

// ---------- 其他 ----------

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

// ---------- 启动 ----------

async function loadConfig() {
  const res = await fetch('./config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(t('config.missing'));
  const c = await res.json();
  RAW = c;
  // config.json 的 lang 只在使用者自己没选过语言时生效
  setLocale(resolveLocale({ configured: c.lang }));
  const strip = (p) => String(p ?? '').replace(/^\/+|\/+$/g, '');
  CONFIG = {
    title: t('config.defaultTitle'),
    siteName: '',
    logo: './logo.png',
    branch: 'main',
    timeZone: 'Asia/Tokyo',
    ...c,
    siteUrl: (c.siteUrl || location.origin).replace(/\/+$/, ''),
    auth: { ...c.auth },
    collection: { label: t('config.defaultCollection'), url: '/{id}/', ...c.collection, dir: strip(c.collection?.dir) },
    media: { url: '/uploads', ...c.media, dir: strip(c.media?.dir) },
    deploy: { skipCiForDrafts: true, ...c.deploy },
  };
  CONFIG.media.url = '/' + strip(CONFIG.media.url);
  if (!CONFIG.repo || !CONFIG.collection.dir || !CONFIG.media.dir || !CONFIG.auth.base) throw new Error(t('config.incomplete'));
  // 编辑器和网站不同域名时，图片从网站地址加载（本地开发时用本地的网站）
  CONFIG.assetBase = isLocal || new URL(CONFIG.siteUrl).origin === location.origin ? '' : CONFIG.siteUrl;
  setImageOptions({ ...CONFIG.media, timeZone: CONFIG.timeZone });

  for (const img of document.querySelectorAll('.brand-logo')) {
    img.src = CONFIG.logo;
    img.alt = CONFIG.siteName;
  }
  relabel();
}

async function start() {
  if (!CONFIG) {
    try {
      await loadConfig();
    } catch (e) {
      document.body.innerHTML = `<p style="padding:40px;font:15px sans-serif">${e.message}</p>`;
      return;
    }
  }
  // 从登录中转跳回来时，令牌在 # 后面
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('access_token')) {
    localStorage.setItem(TOKEN_KEY, hash.get('access_token'));
    if (hash.get('refresh_token')) localStorage.setItem(REFRESH_KEY, hash.get('refresh_token'));
    else localStorage.removeItem(REFRESH_KEY);
  }
  if (hash.has('access_token') || hash.has('error')) history.replaceState(null, '', location.pathname);
  if (hash.get('error')) return showLogin(t('login.failed', { error: hash.get('error') }));

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return showLogin();
  store = new GitHubStore({
    token,
    repo: CONFIG.repo,
    branch: CONFIG.branch,
    contentDir: CONFIG.collection.dir,
    apiBase: API_BASE,
    refresh: refreshToken,
    timeZone: CONFIG.timeZone,
  });

  await busy(t('save.loading'), async () => {
    const me = await store.whoami();
    if (!me.canWrite) return logout(t('login.noAccess', { login: me.login }));
    $('#user-name').textContent = me.name;
    $('#user-avatar').src = me.avatar;
    state.articles = await store.listArticles();
    $('#login').hidden = true;
    $('#app').hidden = false;
    renderList();
    updateBar();
  });
}

start();
window.cmsEditor = editor; // 方便在浏览器控制台排查
