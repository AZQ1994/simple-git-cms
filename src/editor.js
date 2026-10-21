// The editing surface: the TipTap instance, the formatting toolbar, and everything to do with
// images inside the body — inserting, selecting, cropping, captioning and arranging them.
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Paragraph from '@tiptap/extension-paragraph';
import { Markdown } from '@tiptap/markdown';
import { Placeholder } from '@tiptap/extensions';
import { NodeSelection } from '@tiptap/pm/state';
import { $, busy } from './dom.js';
import { displaySrc, emit, on, pending } from './store.js';
import { compressImage, newImagePath, openCropper } from './images.js';
import { icons } from './icons.js';
import { t } from './i18n/index.js';

// Paragraphs: by default a paragraph holding a single image is unwrapped into a standalone image
// node, which suits block-level images. Here images are inline, so the paragraph has to stay —
// otherwise neighbouring image paragraphs collapse into one and end up side by side.
const SiteParagraph = Paragraph.extend({
  parseMarkdown: (token, helpers) => {
    const tokens = token.tokens || [];
    const content = helpers.parseInline(tokens);
    const first = tokens[0];
    const isEmpty = tokens.length === 1 && first.type === 'text' && ['&nbsp;', ' '].some((v) => first.raw === v || first.text === v);
    return helpers.createNode('paragraph', undefined, isEmpty ? [] : content);
  },
  // An empty paragraph — a blank line left by pressing Enter — is written as &nbsp; so the site
  // shows the same blank line. By default only the second of consecutive empties survives.
  renderMarkdown: (node, h) => (node.content?.length ? h.renderChildren(node.content) : '&nbsp;'),
});

// Images are inline nodes, so several in one paragraph render side by side on the site. The
// title attribute carries the caption.
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
    StarterKit.configure({ paragraph: false, heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true }, codeBlock: false, code: false }),
    SiteParagraph,
    SiteImage,
    Markdown,
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
  positionImageBar();
});

// An & is written out as &amp;, which looks the same but should go back as & in the file.
// Blank lines at the very start and end are dropped — inserting an image always leaves one.
export const toMarkdown = () =>
  editor
    .getMarkdown()
    .replace(/&amp;(?![a-zA-Z]+;|#\d+;)/g, '&')
    .replace(/^(?:\s*&nbsp;\s*\n)+/, '')
    .replace(/(?:\n\s*&nbsp;\s*)+\s*$/, '\n');

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

// ---------- Images ----------

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

/** Insert images: one gets its own paragraph, several share one so they sit side by side. */
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

export function onSelection() {
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

on('relabel', onSelection);
