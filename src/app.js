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

let CONFIG; // 启动时从 ./config.json 读入
const TOKEN_KEY = 'simple-git-cms-token';
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
// 本地开发：可以把 GitHub API 指到本机的测试代理
const API_BASE = (isLocal && localStorage.getItem('simple-git-cms-api')) || 'https://api.github.com';

const $ = (s) => document.querySelector(s);
const fill = (root = document) => root.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icons[el.dataset.icon] ?? ''));
fill();

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
  state.dirty = false;
  showLogin(reason);
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
  e.target.reset();
  start();
});

$('#logout').addEventListener('click', () => {
  if (confirmDiscard()) logout();
});

// ---------- 文章列表 ----------

const fmtDate = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: CONFIG.timeZone });

function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const counts = { all: state.articles.length, live: 0, draft: 0 };
  for (const a of state.articles) counts[a.draft ? 'draft' : 'live']++;
  for (const k of Object.keys(counts)) $(`#count-${k}`).textContent = counts[k];

  const items = state.articles.filter(
    (a) =>
      (state.filter === 'all' || (state.filter === 'draft') === a.draft) &&
      (!q || a.title.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q))),
  );
  const ul = $('#list');
  ul.replaceChildren(
    ...items.map((a) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'item' + (state.current?.id === a.id ? ' active' : '');
      btn.innerHTML = `<span class="item-title"></span><span class="item-meta"><span class="dot ${a.draft ? 'draft' : 'live'}"></span><span class="item-state"></span><span>${fmtDate(a.date)}</span></span>`;
      btn.querySelector('.item-title').textContent = a.title || '（无标题）';
      btn.querySelector('.item-state').textContent = a.draft ? '草稿' : '已发布';
      btn.addEventListener('click', () => openArticle(a.id));
      li.append(btn);
      return li;
    }),
  );
  if (!items.length) ul.innerHTML = '<li class="list-empty">没有符合条件的文章</li>';

  const allTags = [...new Set(state.articles.flatMap((a) => a.tags))];
  $('#tag-options').innerHTML = allTags.map((t) => `<option value="${t.replace(/"/g, '&quot;')}"></option>`).join('');
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
const toMarkdown = () => editor.getMarkdown().replace(/&amp;(?![a-zA-Z]+;|#\d+;)/g, '&');

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
    const href = prompt('链接地址（留空表示取消链接）', prev);
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
  busy(`正在处理 ${imgs.length} 张图片…`, async () => {
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
  layout.querySelector('.layout-label').textContent = img.inGroup ? '单独一行' : '与上一张并排';
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
    return pickFiles(([f]) => busy('正在处理图片…', async () => setSrc(await addPending(await compressImage(f)))), false);
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
  for (const t of tags) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = t;
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.setAttribute('aria-label', `删除标签 ${t}`);
    x.addEventListener('click', () => {
      tags = tags.filter((v) => v !== t);
      renderTags();
      markDirty();
    });
    chip.append(x);
    box.insertBefore(chip, input);
  }
  input.placeholder = tags.length ? '' : '添加标签';
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
}

function confirmDiscard() {
  return !state.dirty || confirm('有未保存的修改，确定要放弃吗？');
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
  $('#f-date').value = fmtDate(a.date);
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
  const keepTime = state.current.date && fmtDate(state.current.date) === date;
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
  if (!a.title) return '请填写标题';
  if (!a.body.trim()) return '请填写正文';
  if (!a.tags.length) return '请至少添加一个标签';
  const externalImage = new RegExp(`!\\[[^\\]]*\\]\\((?!${CONFIG.media.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/)[^)]+\\)`);
  if (externalImage.test(a.body)) return '正文里有外部图片地址（可能是从别处粘贴的），请下载后用「图片」按钮重新上传';
  return null;
}

/** 保存。draft 指定保存后的草稿状态；返回是否成功 */
async function save({ draft, force = false, label = '正在保存…' }) {
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
  const verb = !state.current.id ? '新建' : draft && wasLive ? '撤回' : !draft && !wasLive ? '发布' : '更新';
  const message = `${skipCi ? '[skip ci] ' : ''}${verb}文章：${article.title}`;

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
        toast(skipCi ? '草稿已保存' : `已${verb}，约 1 分钟后网站更新`);
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
  if (!live && !confirm('发布后所有人都能在网站上看到这篇文章。确定发布？')) return;
  save({ draft: false, label: live ? '正在更新…' : '正在发布…' });
});
$('#btn-unpublish').addEventListener('click', () => {
  if (confirm('撤回后网站上将看不到这篇文章，内容会保留为草稿。确定撤回？')) save({ draft: true, label: '正在撤回…' });
});
$('#btn-delete').addEventListener('click', async () => {
  if (!confirm(`永久删除草稿「${state.current.title || '无标题'}」？`)) return;
  await busy('正在删除…', async () => {
    await store.saveArticle(state.current, { baseSha: state.current.sha, deleteArticle: true, message: `${CONFIG.deploy.skipCiForDrafts ? '[skip ci] ' : ''}删除草稿：${state.current.title}` });
    state.articles = state.articles.filter((a) => a.id !== state.current.id);
    state.current = null;
    state.dirty = false;
    $('#doc').hidden = true;
    $('#empty').hidden = false;
    updateBar();
    renderList();
    toast('已删除');
  });
});

function resolveConflict(theirs, draft) {
  const modal = $('#conflict-modal');
  $('#conflict-text').textContent = theirs
    ? `在你打开之后，有人保存了新的版本（标题：${theirs.title}）。`
    : '在你打开之后，这篇文章已被删除。';
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
  $('#btn-unpublish').hidden = !has || !a.id || a.draft;
  $('#btn-delete').hidden = !has || !a.id || !a.draft;
  $('#view-live').hidden = !has || !a.id || a.draft;
  if (!has) {
    $('#status').textContent = '';
    return;
  }
  const live = a.id && !a.draft;
  $('#btn-publish').textContent = live ? '更新' : '发布';
  $('#btn-publish').disabled = live && !state.dirty;
  $('#view-live').href = CONFIG.siteUrl + CONFIG.collection.url.replace('{id}', a.id);
  const s = $('#status');
  s.className = `status ${live ? 'live' : 'draft'}`;
  s.textContent = !a.id ? '新文章' : live ? '已发布' : '草稿';
  if (state.dirty) s.textContent += ' · 未保存';
}

let deployTimer;
function watchDeploy(commit) {
  clearTimeout(deployTimer);
  const el = $('#deploy');
  el.hidden = false;
  el.className = 'deploy pending';
  el.textContent = '正在更新网站…';
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
      el.innerHTML = `${icons.check}网站已更新`;
      deployTimer = setTimeout(() => (el.hidden = true), 8000);
    } else if (s === 'failure') {
      el.className = 'deploy fail';
      el.textContent = '网站更新失败，请联系管理员';
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
  $('#desc-hint').textContent = n ? `${n} 字` : '自动生成';
}
$('#f-desc').addEventListener('input', updateDescHint);

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && state.current) {
    e.preventDefault();
    const live = state.current.id && !state.current.draft;
    save({ draft: !live, label: live ? '正在更新…' : '正在保存…' });
  }
});

// ---------- 启动 ----------

async function loadConfig() {
  const res = await fetch('./config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('找不到 config.json');
  const c = await res.json();
  const strip = (p) => String(p ?? '').replace(/^\/+|\/+$/g, '');
  CONFIG = {
    title: '内容管理',
    siteName: '',
    logo: './logo.png',
    branch: 'main',
    timeZone: 'Asia/Tokyo',
    ...c,
    siteUrl: (c.siteUrl || location.origin).replace(/\/+$/, ''),
    auth: { ...c.auth },
    collection: { label: '文章', url: '/{id}/', ...c.collection, dir: strip(c.collection?.dir) },
    media: { url: '/uploads', ...c.media, dir: strip(c.media?.dir) },
    deploy: { skipCiForDrafts: true, ...c.deploy },
  };
  CONFIG.media.url = '/' + strip(CONFIG.media.url);
  if (!CONFIG.repo || !CONFIG.collection.dir || !CONFIG.media.dir || !CONFIG.auth.base) throw new Error('config.json 缺少 repo / collection.dir / media.dir / auth.base');
  // 编辑器和网站不同域名时，图片从网站地址加载
  CONFIG.assetBase = new URL(CONFIG.siteUrl).origin === location.origin ? '' : CONFIG.siteUrl;
  setImageOptions({ ...CONFIG.media, timeZone: CONFIG.timeZone });

  document.title = [CONFIG.title, CONFIG.siteName].filter(Boolean).join(' · ');
  for (const img of document.querySelectorAll('.brand-logo')) {
    img.src = CONFIG.logo;
    img.alt = CONFIG.siteName;
  }
  document.querySelectorAll('[data-text="title"]').forEach((el) => (el.textContent = CONFIG.title));
  document.querySelectorAll('[data-text="collection"]').forEach((el) => (el.textContent = CONFIG.collection.label));
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
  if (hash.get('access_token')) localStorage.setItem(TOKEN_KEY, hash.get('access_token'));
  if (hash.has('access_token') || hash.has('error')) history.replaceState(null, '', location.pathname);
  if (hash.get('error')) return showLogin(`登录失败：${hash.get('error')}`);

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return showLogin();
  store = new GitHubStore({ token, repo: CONFIG.repo, branch: CONFIG.branch, contentDir: CONFIG.collection.dir, apiBase: API_BASE });

  await busy('正在载入…', async () => {
    const me = await store.whoami();
    if (!me.canWrite) return logout(`账号 ${me.login} 没有这个网站仓库的编辑权限，请联系管理员。`);
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
