// The editing surface: the TipTap instance, the formatting toolbar, and the bars that appear for
// the two things that have structure of their own inside the body — images and tables.
import { Editor } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { isInTable, selectedRect } from '@tiptap/pm/tables';
import { $, busy, toast } from './dom.js';
import { blockNamed, blocks, emptyElement, tableBlock } from './blocks.js';
import { cleanMarkdown, schemaExtensions } from './schema.js';
import { addPending, displaySrc, emit, on } from './store.js';
import { checkFileSize, compressImage, newFilePath, newImagePath, openCropper } from './images.js';
import { icons } from './icons.js';
import { t } from './i18n/index.js';

// Images are inline nodes, so several in one paragraph render side by side on the site. The
// title attribute carries the caption. This one node stays here rather than in schema.js because
// its view needs the editor's own state — which of the images are not uploaded yet.
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

export const editor = new Editor({
  element: $('#body'),
  extensions: [
    ...schemaExtensions,
    SiteImage,
    // Only the empty-editor class is wanted here; the prompt itself is drawn by CSS from
    // --body-placeholder, so it follows the interface language without rebuilding the editor
    Placeholder.configure({ placeholder: '' }),
  ],
  contentType: 'markdown',
  content: '',
  onUpdate: () => emit('doc:edited'),
  editorProps: {
    handlePaste: (_v, e) => insertFiles([...(e.clipboardData?.files ?? [])]),
    handleDrop: (_v, e) => insertFiles([...(e.dataTransfer?.files ?? [])]),
  },
});
editor.on('selectionUpdate', onSelection);
editor.on('transaction', () => {
  updateToolbar();
  positionBars();
});

export const toMarkdown = () => cleanMarkdown(editor.getMarkdown());

/** Put an article's body in the editor without entering the undo history, so Undo cannot step
 * back into the article that was open before. */
export function setBody(markdown) {
  editor.chain().setMeta('addToHistory', false).setContent(markdown, { contentType: 'markdown', emitUpdate: false }).run();
}

// ---------- Toolbar ----------

const commands = {
  h2: (c) => c.toggleHeading({ level: 2 }),
  bold: (c) => c.toggleBold(),
  italic: (c) => c.toggleItalic(),
  bulletList: (c) => c.toggleBulletList(),
  orderedList: (c) => c.toggleOrderedList(),
  blockquote: (c) => c.toggleBlockquote(),
  code: (c) => c.toggleCode(),
  codeBlock: (c) => c.toggleCodeBlock(),
  table: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
  html: (c) => c.insertContent({ type: 'htmlBlock', attrs: { html: '' } }),
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
  code: () => editor.isActive('code'),
  codeBlock: () => editor.isActive('codeBlock'),
  link: () => editor.isActive('link'),
  table: () => editor.isActive('table'),
  html: () => editor.isActive('htmlBlock'),
};

$('#toolbar').addEventListener('click', (e) => {
  if (e.target.closest('[data-menu]')) return showMenu($('#insert-list').hidden);
  const b = e.target.closest('[data-cmd]');
  if (!b) return;
  const cmd = b.dataset.cmd;
  if (cmd === 'table') stepPastSelection();
  if (cmd === 'image') return pickFiles((files) => insertFiles(files));
  if (cmd === 'attach') return pickFiles(([f]) => attach(f), { multiple: false, accept: '' });
  if (cmd === 'block') return insertBlock(blockNamed(b.dataset.block));
  if (cmd === 'link') {
    const prev = editor.getAttributes('link').href ?? '';
    const href = prompt(t('toolbar.linkPrompt'), prev);
    if (href === null) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    return (href.trim() ? chain.setLink({ href: href.trim() }) : chain.unsetLink()).run();
  }
  commands[cmd](editor.chain().focus()).run();
});

/** The insert menu: one line per block the site has defined for itself, and raw HTML at the
 * bottom for everything no definition covers. Called once, after the config is in. */
export function addBlockMenu() {
  const list = $('#insert-list');
  for (const def of blocks()) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'menu-item';
    item.dataset.cmd = 'block';
    item.dataset.block = def.name;
    item.textContent = def.label;
    list.append(item);
  }
  // Its label is the interface's, so it is filled in by relabel() rather than written here
  const html = document.createElement('button');
  html.type = 'button';
  html.className = 'menu-item';
  html.dataset.cmd = 'html';
  html.dataset.i18n = 'toolbar.htmlItem';
  list.append(html);
}

$('#insert-list').addEventListener('click', (e) => {
  const item = e.target.closest('[data-cmd]');
  if (!item) return;
  showMenu(false);
  if (item.dataset.cmd === 'block') return insertBlock(blockNamed(item.dataset.block));
  stepPastSelection();
  return commands.html(editor.chain().focus()).run();
});

/** A block is one thing you can select, and inserting anything while a node is selected replaces
 * it. So before inserting, step past whatever is selected: adding a block next to a card has no
 * business deleting the card. */
function stepPastSelection() {
  const { selection, tr } = editor.state;
  if (selection instanceof NodeSelection) editor.view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(selection.to))));
}

/** Put a block in, in whatever shape its definition asks to be edited in. */
function insertBlock(def) {
  if (!def) return;
  stepPastSelection();
  if (def.edit === 'source') {
    editor.chain().focus().insertContent({ type: 'htmlBlock', attrs: { html: emptyElement(def) } }).run();
    return;
  }
  if (def.edit !== 'table') {
    editor.chain().focus().insertContent({ type: 'customBlock', attrs: { block: def.name, values: {}, raw: '' } }).run();
    return;
  }
  // A table block is the same table, written as HTML — which is the spelling that can merge cells
  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  setFormat('html');
}

function showMenu(open) {
  const list = $('#insert-list');
  const button = $('#insert-menu');
  // Placed from here rather than by CSS: the list sits outside the toolbar, which scrolls
  // sideways on a phone and blurs what is behind it
  list.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
  if (!open) return;
  const r = button.getBoundingClientRect();
  list.style.top = `${r.bottom + 4}px`;
  list.style.left = `${Math.max(8, Math.min(r.left, innerWidth - list.offsetWidth - 8))}px`;
}
// A menu that stays open after the click that was meant for the page behind it is a nuisance
addEventListener('pointerdown', (e) => !e.target.closest('#insert-menu, #insert-list') && showMenu(false));
addEventListener('keydown', (e) => e.key === 'Escape' && showMenu(false));

function updateToolbar() {
  for (const b of document.querySelectorAll('#toolbar [data-cmd]')) b.classList.toggle('on', Boolean(active[b.dataset.cmd]?.()));
}

// ---------- Images ----------

let filePicked;
function pickFiles(cb, { multiple = true, accept = 'image/*' } = {}) {
  const input = $('#file-input');
  input.multiple = multiple;
  input.accept = accept;
  filePicked = cb;
  input.click();
}
$('#file-input').addEventListener('change', (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) filePicked?.(files);
});

const hold = (blob) => addPending(newImagePath(), blob);

/** Insert images: one gets its own paragraph, several share one so they sit side by side. */
function insertFiles(files) {
  const imgs = files.filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) return false;
  busy(t('img.processing', { n: imgs.length }), async () => {
    const nodes = [];
    for (const f of imgs) nodes.push({ type: 'image', attrs: { src: hold(await compressImage(f)), alt: '' } });
    editor.chain().focus().insertContent([{ type: 'paragraph', content: nodes }, { type: 'paragraph' }]).run();
  });
  return true;
}

/** Put a file in the repository as it is — no compressing, no resizing — and link to it from
 * where the cursor is. The link's text is the name the file arrived with. */
function attach(file) {
  busy(t('file.attaching'), async () => {
    checkFileSize(file);
    const path = addPending(newFilePath(file.name), file);
    editor
      .chain()
      .focus()
      .insertContent([{ type: 'text', text: file.name, marks: [{ type: 'link', attrs: { href: path } }] }, { type: 'text', text: ' ' }])
      .run();
  });
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

export function onSelection() {
  const img = selectedImage();
  // An image can sit inside a cell, and then both bars would want the same spot. The image is
  // the narrower thing the person just clicked, so it wins.
  const table = img ? null : tableAt();
  $('#img-bar').hidden = !img;
  $('#table-bar').hidden = !table;
  $('#caption-form').hidden = true;
  if (img) {
    const layout = $('#img-bar [data-img="layout"]');
    layout.hidden = !img.inGroup && !img.prevIsImages;
    layout.querySelector('.layout-label').textContent = img.inGroup ? t('img.layoutAlone') : t('img.layoutSide');
    layout.querySelector('[data-icon]').innerHTML = img.inGroup ? icons.rows : icons.columns;
  }
  if (table) {
    $('#table-bar [data-table="align"] [data-icon]').innerHTML = icons[`align${capitalize(columnAlign() ?? 'left')}`];
    // What a table can hold depends on which of the two spellings it is written in, so the bar
    // says which — and offers the other one, when the site has defined a block for it
    const def = tableBlock();
    const html = isHtmlTable(table.node);
    const advanced = $('#table-bar [data-table="advanced"]');
    advanced.hidden = !def;
    advanced.classList.toggle('on', html);
    if (def) {
      advanced.querySelector('.tb-label').textContent = def.label;
      advanced.title = t(html ? 'table.plain' : 'table.advanced', { label: def.label });
    }
    // Merging is the thing only an HTML table can do, so it is only offered on one
    $('#table-bar [data-table="merge"]').hidden = !html;
  }
  positionBars();
}

const capitalize = (s) => s[0].toUpperCase() + s.slice(1);

/** Put a bar above the node it belongs to, inside the scrolling area and never off either edge.
 * A table is as wide as the text, so its bar goes to the right rather than over the middle of
 * whatever line sits above it. */
function placeBar(bar, dom, { toTheRight = false } = {}) {
  if (bar.hidden || !dom) return;
  const r = dom.getBoundingClientRect();
  const main = $('.main').getBoundingClientRect();
  const top = Math.max(r.top - main.top + $('.main').scrollTop - bar.offsetHeight - 10, $('.main').scrollTop + 64);
  const left = toTheRight ? r.right - main.left - bar.offsetWidth : r.left - main.left + r.width / 2 - bar.offsetWidth / 2;
  bar.style.top = `${top}px`;
  bar.style.left = `${Math.min(Math.max(left, 8), main.width - bar.offsetWidth - 8)}px`;
}

function positionBars() {
  const img = selectedImage();
  if (img) placeBar($('#img-bar'), editor.view.nodeDOM(img.pos));
  const table = tableAt();
  if (table) placeBar($('#table-bar'), editor.view.nodeDOM(table.pos), { toTheRight: true });
}
$('.main').addEventListener('scroll', () => {
  positionBars();
  showMenu(false); // the list is placed against the button, which has just moved
});
addEventListener('resize', positionBars);

$('#img-bar').addEventListener('mousedown', (e) => e.target.closest('input') || e.preventDefault()); // keep the image selected
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
    return positionBars();
  }
  if (act === 'crop') {
    const blob = await openCropper(displaySrc(img.node.attrs.src));
    if (blob) setSrc(hold(blob));
    return;
  }
  if (act === 'replace') {
    return pickFiles(([f]) => busy(t('img.processingOne'), async () => setSrc(hold(await compressImage(f)))), { multiple: false });
  }
  if (act === 'layout') {
    const { tr, schema } = editor.state;
    if (img.inGroup) {
      // Onto its own row: the first of the group goes before it, the rest after, so the original
      // order is kept
      const first = img.pos === img.paraPos + 1;
      tr.delete(img.pos, img.pos + 1);
      const at = first ? img.paraPos : img.paraPos + img.para.nodeSize - 1;
      tr.insert(at, schema.nodes.paragraph.create(null, img.node));
      tr.setSelection(NodeSelection.create(tr.doc, at + 1));
    } else if (img.prevIsImages) {
      // Append it to the previous paragraph of images
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
  // The caption goes in Markdown's "title", so strip the double quotes that would break it
  const title = $('#caption-input').value.trim().replace(/"/g, '”') || null;
  editor.chain().command(({ tr }) => (tr.setNodeMarkup(img.pos, undefined, { ...img.node.attrs, title }), true)).setNodeSelection(img.pos).run();
  $('#caption-form').hidden = true;
});

// ---------- Tables ----------
//
// Only what a GFM table can hold: rows, columns, and one alignment per column — no merged cells,
// and the first row is always the header. The bar sets alignment on the whole column, because
// that is the only place the file has to put it.

const ALIGN = ['left', 'center', 'right'];

/** The table the cursor is in, if any. */
function tableAt() {
  const { $anchor } = editor.state.selection;
  for (let d = $anchor.depth; d > 0; d--) if ($anchor.node(d).type.name === 'table') return { node: $anchor.node(d), pos: $anchor.before(d) };
  return null;
}

/** The alignment of the column the cursor is in, as the file spells it — null when it says nothing,
 * which browsers draw the same as left. */
function columnAlign() {
  if (!isInTable(editor.state)) return null;
  const { map, table, left } = selectedRect(editor.state);
  return table.nodeAt(map.map[left])?.attrs.align ?? null;
}

function setColumnAlign(align) {
  const { map, left, tableStart } = selectedRect(editor.state);
  const { tr } = editor.state;
  for (let row = 0; row < map.height; row++) {
    const pos = tableStart + map.map[row * map.width + left];
    const cell = tr.doc.nodeAt(pos);
    if (cell) tr.setNodeMarkup(pos, undefined, { ...cell.attrs, align });
  }
  editor.view.dispatch(tr);
  editor.view.focus();
}

const tableCommands = {
  rowAfter: (c) => c.addRowAfter(),
  rowDelete: (c) => c.deleteRow(),
  colAfter: (c) => c.addColumnAfter(),
  colDelete: (c) => c.deleteColumn(),
  delete: (c) => c.deleteTable(),
  merge: (c) => c.mergeOrSplit(),
};

/** Whether any cell spans more than one, which a pipe table has no way of saying. */
function hasMergedCells(table) {
  let merged = false;
  table.descendants((n) => {
    if (n.attrs?.colspan > 1 || n.attrs?.rowspan > 1) merged = true;
  });
  return merged;
}

/** Whether the table the cursor is in is written as HTML — because it says so, or because it
 * holds something a pipe table cannot say. */
const isHtmlTable = (node) => node.attrs.format === 'html' || hasMergedCells(node);

/** Write this table in one spelling or the other. */
function setFormat(format) {
  const table = tableAt();
  if (!table) return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(table.pos, undefined, { ...table.node.attrs, format }));
  editor.view.focus();
  onSelection();
}

/** The advanced-table button: the same table, written as HTML and back again. */
function toggleAdvanced() {
  const table = tableAt();
  if (!table) return;
  if (isHtmlTable(table.node) && hasMergedCells(table.node)) return toast(t('table.needsHtml'), 'error');
  setFormat(isHtmlTable(table.node) ? 'gfm' : 'html');
  return undefined;
}

$('#table-bar').addEventListener('mousedown', (e) => e.preventDefault()); // keep the cursor in its cell
$('#table-bar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-table]');
  if (!b || !isInTable(editor.state)) return;
  // A column with no marker is drawn left-aligned, so that is what the button shows and steps on from
  if (b.dataset.table === 'advanced') return toggleAdvanced();
  if (b.dataset.table === 'align') return setColumnAlign(ALIGN[(ALIGN.indexOf(columnAlign() ?? 'left') + 1) % ALIGN.length]);
  tableCommands[b.dataset.table](editor.chain().focus()).run();
});

on('relabel', onSelection);
