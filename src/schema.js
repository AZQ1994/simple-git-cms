// What a document may contain, and how each part is written back as Markdown. Kept apart from the
// editor itself because nothing here reaches for the DOM as it loads — the one node view below
// only runs in a browser — so the whole Markdown round-trip can be tested in Node.
import { Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Paragraph from '@tiptap/extension-paragraph';
import { Markdown } from '@tiptap/markdown';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { blockNamed, fillBlock, fillTemplate, matchBlock } from './blocks.js';
import { t } from './i18n/index.js';

// Paragraphs: by default a paragraph holding a single image is unwrapped into a standalone image
// node, which suits block-level images. Here images are inline, so the paragraph has to stay —
// otherwise neighbouring image paragraphs collapse into one and end up side by side.
export const SiteParagraph = Paragraph.extend({
  parseMarkdown: (token, helpers) => {
    const block = asBlock(token); // a paragraph may be one of the site's own blocks
    if (block) return block;
    const tokens = token.tokens || [];
    const content = helpers.parseInline(tokens);
    const first = tokens[0];
    const isEmpty = tokens.length === 1 && first.type === 'text' && ['&nbsp;', ' '].some((v) => first.raw === v || first.text === v);
    return helpers.createNode('paragraph', undefined, isEmpty ? [] : content);
  },
  // An empty paragraph — a blank line left by pressing Enter — is written as &nbsp; so the site
  // shows the same blank line. By default only the second of consecutive empties survives.
  renderMarkdown: (node, h) => (node.content?.length ? h.renderChildren(node.content) : '&nbsp;'),
});

// ---------- Tables ----------
//
// A GFM table is flat: one header row, one line per row, inline content in the cells. So the cells
// here hold exactly one paragraph — not the block content the extension allows by default — and
// cells are never merged. Nothing can be built in the editor that the file cannot carry back.

const oneParagraph = { content: 'paragraph' };
export const SiteTableCell = TableCell.extend(oneParagraph);
export const SiteTableHeader = TableHeader.extend(oneParagraph);

// Characters that take two columns in a monospaced font — CJK, kana, full-width punctuation,
// emoji. Counted so that a table of Japanese text still lines up in the file.
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︐-︙︰-﹯＀-｠￠-￦]|[\u{1f300}-\u{1f9ff}]|[\u{20000}-\u{3fffd}]/u;
const width = (text) => [...text].reduce((n, c) => n + (WIDE.test(c) ? 2 : 1), 0);

// Cells are padded the way the column is aligned, so the file reads like the table it describes
function pad(text, w, align) {
  const gap = Math.max(0, w - width(text));
  if (align === 'right') return ' '.repeat(gap) + text;
  if (align !== 'center') return text + ' '.repeat(gap);
  const left = Math.floor(gap / 2);
  return ' '.repeat(left) + text + ' '.repeat(gap - left);
}

/** One cell's inline content as a single line. A pipe would end the cell, so it is escaped; a line
 * break inside a cell has no Markdown spelling, so it becomes <br>. */
function cellText(cell, h) {
  const [block] = cell?.content ?? [];
  const text = block?.content?.length ? h.renderChildren(block.content) : '';
  return text
    .replace(/[ \t]*\r?\n[ \t]*/g, '<br>')
    .replace(/\\.|\|/g, (m) => (m === '|' ? '\\|' : m))
    .trim();
}

// The dashes under a column carry its alignment, and are padded to the column's width so the
// file stays readable.
const dashes = (w, align) =>
  align === 'left' ? `:${'-'.repeat(w - 1)}` : align === 'right' ? `${'-'.repeat(w - 1)}:` : align === 'center' ? `:${'-'.repeat(w - 2)}:` : '-'.repeat(w);

export const SiteTable = Table.extend({
  renderMarkdown(node, h) {
    const rows = (node.content ?? []).map((row) => (row.content ?? []).map((cell) => cellText(cell, h)));
    if (!rows.length) return '';
    const cols = Math.max(...rows.map((r) => r.length));
    const cell = (row, i) => row[i] ?? ''; // a short row happens while a column is being added
    // GFM gives one alignment per column, so the header row is the one that decides
    const align = Array.from({ length: cols }, (_, i) => node.content[0]?.content?.[i]?.attrs?.align ?? null);
    const widths = Array.from({ length: cols }, (_, i) => Math.max(3, ...rows.map((r) => width(cell(r, i)))));
    const line = (row) => `| ${Array.from({ length: cols }, (_, i) => pad(cell(row, i), widths[i], align[i])).join(' | ')} |`;
    const [header, ...body] = rows;
    return [line(header), `| ${widths.map((w, i) => dashes(w, align[i])).join(' | ')} |`, ...body.map(line)].join('\n');
  },
});

// ---------- Blocks a site defines for itself ----------
//
// config.blocks says what they look like in the file; blocks.js turns each template into
// something that recognises itself. Here they become one node type with a small form in it, so
// that adding a YouTube embed to a site is a line of config rather than a change to the editor.

/** Whatever a block looks like, it arrives as a run of HTML or as a paragraph of text, so both of
 * those handlers ask this first. */
const asBlock = (token) => {
  const found = matchBlock(token.raw ?? '');
  return found ? { type: 'customBlock', attrs: found } : null;
};

export const CustomBlock = Node.create({
  name: 'customBlock',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ block: { default: '' }, values: { default: {} }, raw: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-block]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', { 'data-block': HTMLAttributes.block }],
  // An insert that was never filled in is not written to the file at all
  renderMarkdown: (node) => (Object.values(node.attrs.values ?? {}).some(Boolean) || node.attrs.raw ? fillBlock(node.attrs) : ''),
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const def = blockNamed(node.attrs.block);
      const dom = document.createElement('div');
      dom.className = 'block-card';
      const label = document.createElement('span');
      label.className = 'html-label';
      label.textContent = def?.label ?? node.attrs.block;
      dom.append(label);

      const shot = document.createElement('img');
      shot.className = 'block-shot';
      shot.addEventListener('error', () => (shot.hidden = true)); // no preview is better than a broken one
      dom.append(shot);

      const put = (name, value) => {
        const pos = getPos();
        if (pos == null) return;
        const values = { ...node.attrs.values, [name]: value };
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, values, raw: '' }));
        showPreview(values);
      };
      const showPreview = (values) => {
        const src = def?.preview ? fillTemplate(def.preview, values) : '';
        shot.hidden = !src;
        if (src) shot.src = src;
      };

      for (const field of def?.fields ?? []) {
        const row = document.createElement('label');
        row.className = 'block-field';
        const name = document.createElement('span');
        name.textContent = field.label ?? field.name;
        const input = document.createElement(field.multiline ? 'textarea' : 'input');
        input.value = node.attrs.values?.[field.name] ?? '';
        if (field.placeholder) input.placeholder = field.placeholder;
        if (field.multiline) input.rows = 3;
        input.addEventListener('input', () => put(field.name, input.value));
        row.append(name, input);
        dom.append(row);
      }
      // A block whose definition is gone keeps what it was read as, and says so
      if (!def) {
        const gone = document.createElement('p');
        gone.className = 'block-gone';
        gone.textContent = node.attrs.raw;
        dom.append(gone);
      }
      showPreview(node.attrs.values ?? {});

      return {
        dom,
        update: (n) => n.type.name === 'customBlock' && n.attrs.block === node.attrs.block,
        selectNode: () => dom.classList.add('selected'),
        deselectNode: () => dom.classList.remove('selected'),
        stopEvent: () => true,
        ignoreMutation: () => true,
      };
    };
  },
});

// ---------- Raw HTML ----------
//
// Anything in the file the editor has no node for — a leftover <div>, a comment, a component a
// site builds its own embeds from — is kept exactly as written instead of being quietly dropped
// on the next save. It shows up as a box you can edit the source of, so it is also the way to put
// something in that the toolbar doesn't cover.

export const HtmlBlock = Node.create({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  draggable: true,
  code: true,
  addAttributes: () => ({ html: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-html-block]', getAttrs: (el) => ({ html: el.getAttribute('data-html') ?? el.textContent ?? '' }) }],
  renderHTML: ({ HTMLAttributes }) => ['div', { 'data-html-block': '', 'data-html': HTMLAttributes.html ?? '' }],
  markdownTokenName: 'html',
  // Inline HTML — a <br> in the middle of a sentence — is not a block and is left to the usual
  // parsing; returning nothing hands the token back to it.
  parseMarkdown: (token) =>
    token.block === false || !token.raw?.trim() ? null : asBlock(token) ?? { type: 'htmlBlock', attrs: { html: token.raw.trim() } },
  renderMarkdown: (node) => node.attrs.html ?? '',
  // The box the editor draws for it: the source in a text area, so whatever the toolbar has no
  // button for can still be written by hand and read back later.
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.className = 'html-block';
      const label = document.createElement('span');
      label.className = 'html-label';
      label.textContent = 'HTML';
      const area = document.createElement('textarea');
      area.spellcheck = false;
      area.value = node.attrs.html;
      area.placeholder = t('html.placeholder');
      const fit = () => {
        area.style.height = 'auto';
        area.style.height = `${area.scrollHeight}px`;
      };
      area.addEventListener('input', () => {
        fit();
        const pos = getPos();
        if (pos != null) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { html: area.value }));
      });
      dom.append(label, area);
      requestAnimationFrame(fit);
      return {
        dom,
        update: (n) => {
          if (n.type.name !== 'htmlBlock') return false;
          if (document.activeElement !== area && n.attrs.html !== area.value) {
            area.value = n.attrs.html;
            fit();
          }
          return true;
        },
        selectNode: () => dom.classList.add('selected'),
        deselectNode: () => dom.classList.remove('selected'),
        stopEvent: () => true, // everything inside the box belongs to the text area
        ignoreMutation: () => true,
      };
    };
  },
});


/** Everything the document is made of, bar the image node, which needs the browser. */
export const schemaExtensions = [
  CustomBlock,
  StarterKit.configure({ paragraph: false, heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
  SiteParagraph,
  SiteTable,
  TableRow,
  SiteTableCell,
  SiteTableHeader,
  HtmlBlock,
  Markdown,
];

/** Stretches of the output that are literal: fenced and inline code, and a block of raw HTML.
 * Everything a writer typed has been escaped by this point, so a `<` at the start of a line can
 * only be one of the HTML blocks above. */
const LITERAL = /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`+[^`\n]*`+|^<[\s\S]*?(?=\n\n|$)/gm;

/** An & is written out as &amp; and < > as &lt; &gt;, which look the same on the site but are not
 * what the file said. They go back as they were, so that what someone typed — a "<" in a sentence,
 * a <br>, a template tag a site expands itself — is still there the next time the file is read.
 * (An &amp; followed by an entity name is left alone: it is how a file writes a literal &lt;.) */
const unescape = (text) =>
  text
    .replace(/&amp;(?![a-zA-Z]+;|#\d+;)/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

/** The serializer's output, as it should be written to the file: entities put back, except where
 * the file is quoting something and &lt; means those four characters. Blank lines at the very
 * start and end are dropped — inserting an image always leaves one. */
export function cleanMarkdown(md) {
  let out = '';
  let at = 0;
  for (const m of md.matchAll(LITERAL)) {
    out += unescape(md.slice(at, m.index)) + m[0];
    at = m.index + m[0].length;
  }
  return (out + unescape(md.slice(at))).replace(/^(?:\s*&nbsp;\s*\n)+/, '').replace(/(?:\n\s*&nbsp;\s*)+\s*$/, '\n');
}
