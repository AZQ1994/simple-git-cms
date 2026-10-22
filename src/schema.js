// What a document may contain, and how each part is written back as Markdown. Kept apart from the
// editor itself because nothing here reaches for the DOM as it loads — the one node view below
// only runs in a browser — so the whole Markdown round-trip can be tested in Node.
import { Node } from '@tiptap/core';
import { NodeSelection, Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import Paragraph from '@tiptap/extension-paragraph';
import { Markdown } from '@tiptap/markdown';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { blockFields, blockNamed, claimFor, fillBlock, fillTemplate, matchBlock, wholeElement } from './blocks.js';
import { needsHtml, parseHtmlTable, writeHtmlTable } from './html-table.js';
import { trackHtml } from './html-scan.js';
import { t } from './i18n/index.js';

// Paragraphs: by default a paragraph holding a single image is unwrapped into a standalone image
// node, which suits block-level images. Here images are inline, so the paragraph has to stay —
// otherwise neighbouring image paragraphs collapse into one and end up side by side.
export const SiteParagraph = Paragraph.extend({
  parseMarkdown: (token, helpers) => {
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
// here hold exactly one paragraph — not the block content the extension allows by default.
// Merging cells is beyond a pipe table, so it belongs to a `table` block (config.blocks), which is
// the same node written as HTML. Nothing can be built in the editor that the file cannot carry back.

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
  addAttributes() {
    return {
      ...this.parent?.(),
      // Which of the two spellings this table is written in. A table read from a pipe table stays
      // one; a table read from HTML stays HTML; merging cells forces HTML, since pipes cannot.
      format: { default: 'gfm', rendered: false },
    };
  },
  renderMarkdown(node, h) {
    if (node.attrs?.format === 'html' || needsHtml(node)) return writeHtmlTable(node);
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
// config.blocks says which tags are the site's own; blocks.js decides whether a piece of HTML is
// one of them. Here they become a node, so that adding a YouTube embed to a site is a line of
// config rather than a change to the editor.

// A box is an atom: everything inside it belongs to the text area or the form, which is what
// makes it editable — and it is also why neither the mouse nor Backspace reaches the editor to
// take the box out again. So each box carries its own way out.

/** Take this node out, leaving the cursor where it stood. */
const removeNode = (editor, getPos) => {
  const pos = getPos();
  if (pos == null) return;
  editor.chain().setNodeSelection(pos).deleteSelection().focus().run();
};

/** What to press to get out again, shown while the box has the keyboard. */
function escapeHint() {
  const hint = document.createElement('span');
  hint.className = 'node-hint';
  hint.textContent = t('block.escape');
  return hint;
}

/** The × in the corner of a box. */
function removeButton(remove) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'node-remove';
  button.tabIndex = -1;
  button.title = t('block.remove');
  button.textContent = '×';
  button.addEventListener('click', remove);
  return button;
}

/** Step into the box that is selected — arrowed onto with the keyboard, say. Without this the
 * keyboard can reach a box and then has nothing to do with it. */
const stepInto = (editor, name) => {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== name) return false;
  const field = editor.view.nodeDOM(selection.from)?.querySelector?.('textarea, input');
  if (!field) return false;
  field.focus();
  field.setSelectionRange?.(field.value.length, field.value.length);
  return true;
};

/** And Escape steps back out, to the box itself: from there the arrow keys carry on as usual and
 * Backspace takes it out. A box you can type into has to be a box you can leave. */
const stepOut = (field, editor, getPos) =>
  field.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const pos = getPos();
    if (pos == null) return;
    e.preventDefault();
    e.stopPropagation();
    editor.chain().focus().setNodeSelection(pos).run();
  });

/** Backspace in a field that is empty, with nothing else in the box to keep, takes the box out —
 * the way Backspace empties anything else. */
const removeWhenEmpty = (field, isEmpty, remove) =>
  field.addEventListener('keydown', (e) => {
    if (!['Backspace', 'Delete'].includes(e.key) || field.value || !isEmpty()) return;
    e.preventDefault();
    remove();
  });

/** What a definition makes of a run of HTML, by the editor it asks for: a card of fields, a table
 * the editor can edit as a table, or — for `source`, and for HTML nothing claims — nothing, which
 * leaves it as the box of source below. */
const claimed = (html) => {
  const def = claimFor(html);
  if (!def) return null;
  if (def.edit === 'table') return parseHtmlTable(html);
  if (def.edit !== 'fields') return null;
  const found = matchBlock(html);
  return found ? { type: 'customBlock', attrs: found } : null;
};

/** The node a run of HTML belongs in: a card, a table, or the source box. The reader decides this
 * when a file is opened; pasting markup into the editor is the same question. */
export const nodeFromHtml = (html) => claimed(html) ?? { type: 'htmlBlock', attrs: { html: html.trim() } };

export const CustomBlock = Node.create({
  name: 'customBlock',
  group: 'block',
  atom: true,
  draggable: true,
  // `shape` is how the file wrote the element — self-closing or not, which attributes were bare.
  // An attribute the node does not declare is dropped, and with it the element's own spelling.
  addAttributes: () => ({ block: { default: '' }, values: { default: {} }, raw: { default: '' }, shape: { default: null } }),
  parseHTML: () => [{ tag: 'div[data-block]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', { 'data-block': HTMLAttributes.block }],
  // An insert that was never filled in is not written to the file at all
  renderMarkdown: (node) => (Object.values(node.attrs.values ?? {}).some(Boolean) || node.attrs.raw ? fillBlock(node.attrs) : ''),
  addKeyboardShortcuts() {
    return { Enter: () => stepInto(this.editor, this.name) };
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const def = blockNamed(node.attrs.block);
      let current = node; // what the card is showing now, which is not what it was created with
      const remove = () => removeNode(editor, getPos);
      const dom = document.createElement('div');
      dom.className = 'block-card';
      const label = document.createElement('span');
      label.className = 'html-label';
      label.textContent = def?.label ?? node.attrs.block;
      dom.append(label, escapeHint(), removeButton(remove));

      const shot = document.createElement('img');
      shot.className = 'block-shot';
      shot.addEventListener('error', () => (shot.hidden = true)); // no preview is better than a broken one
      dom.append(shot);

      const put = (name, value) => {
        const pos = getPos();
        if (pos == null) return;
        const values = { ...current.attrs.values, [name]: value };
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, values, raw: '' }));
        showPreview(values);
      };
      const showPreview = (values) => {
        const src = def?.preview ? fillTemplate(def.preview, values) : '';
        shot.hidden = !src;
        if (src) shot.src = src;
      };

      // Attributes the definition never mentioned are kept and editable, but folded away: a real
      // YouTube embed has eight of them, and seven are the same eight every time
      const rest = document.createElement('details');
      rest.className = 'block-more';
      const restLabel = document.createElement('summary');
      rest.append(restLabel);

      for (const field of def ? blockFields(def, node.attrs.values) : []) {
        const row = document.createElement('label');
        row.className = 'block-field';
        const name = document.createElement('span');
        name.textContent = field.label ?? field.name;
        const input = document.createElement(field.multiline ? 'textarea' : 'input');
        input.value = node.attrs.values?.[field.name] ?? '';
        if (field.placeholder) input.placeholder = field.placeholder;
        if (field.multiline) input.rows = 3;
        input.addEventListener('input', () => put(field.name, input.value));
        removeWhenEmpty(input, () => !Object.values(current.attrs.values ?? {}).some(Boolean), remove);
        stepOut(input, editor, getPos);
        row.append(name, input);
        (field.declared ? dom : rest).append(row);
      }
      if (rest.childElementCount > 1) {
        restLabel.textContent = t('block.more', { n: rest.childElementCount - 1 });
        dom.append(rest);
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
        update: (n) => {
          if (n.type.name !== 'customBlock' || n.attrs.block !== current.attrs.block) return false;
          current = n; // so that filling in a second field doesn't write back the first one's old value
          return true;
        },
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
  // Markdown ends a block of HTML at the first blank line, so an element the site declared that
  // was written across one — a notice with two paragraphs in it — would arrive as an opening tag,
  // a paragraph, and a closing tag stranded in the text. This reads it back as the one element it
  // is. Everything else keeps Markdown's own rules.
  markdownTokenizer: {
    name: 'siteElement',
    level: 'block',
    // Only where one really begins, so nothing else about where a paragraph ends changes
    start: (src) => [...src.matchAll(/^</gm)].find((m) => wholeElement(src.slice(m.index)))?.index ?? -1,
    tokenize: (src) => {
      const raw = wholeElement(src);
      return raw ? { type: 'html', raw, block: true, pre: false, text: raw } : undefined;
    },
  },
  // Inline HTML — a <br> in the middle of a sentence — is not a block and is left to the usual
  // parsing; returning nothing hands the token back to it.
  parseMarkdown: (token) =>
    token.block === false || !token.raw?.trim()
      ? null
      : // whatever the site's own definitions make of it, and the source itself when none do
        claimed(token.raw) ?? { type: 'htmlBlock', attrs: { html: token.raw.replace(/\s+$/, '') } },
  renderMarkdown: (node) => node.attrs.html ?? '',
  addKeyboardShortcuts() {
    return { Enter: () => stepInto(this.editor, this.name) };
  },
  // Markdown keeps a document's HTML apart — one box here, a line of text there — but the page it
  // all ends up on does not: a tag opened anywhere and never closed wraps everything after it,
  // article and site furniture alike. So the whole document is read as one run of HTML, in order,
  // and whatever opened what nothing closes is marked where it stands: the box, or the very
  // characters in the sentence. Code is quoting, not markup, and is skipped.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const open = [];
            const strays = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name === 'htmlBlock') {
                strays.push(...trackHtml(node.attrs.html ?? '', open, { from: pos, to: pos + node.nodeSize }));
                return false;
              }
              if (node.type.name === 'codeBlock') return false;
              if (node.isText && !node.marks.some((m) => m.type.name === 'code')) strays.push(...trackHtml(node.text ?? '', open, { in: pos }));
              return true;
            });
            const bad = [...open.map((o) => ({ ...o, why: 'unclosed' })), ...strays.map((o) => ({ ...o, why: 'stray' }))];
            return DecorationSet.create(
              state.doc,
              bad.map(({ mark, at, len, why, tag }) => {
                const attrs = { title: t(`html.${why}`, { tag }) };
                return mark.in === undefined
                  ? Decoration.node(mark.from, mark.to, { ...attrs, class: 'html-broken' })
                  : Decoration.inline(mark.in + at, mark.in + at + len, { ...attrs, class: 'html-broken-tag' });
              }),
            );
          },
        },
      }),
    ];
  },
  // The box the editor draws for it: the source in a text area, so whatever the toolbar has no
  // button for can still be written by hand and read back later.
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const remove = () => removeNode(editor, getPos);
      const dom = document.createElement('div');
      dom.className = 'html-block';
      const label = document.createElement('span');
      label.className = 'html-label';
      const area = document.createElement('textarea');
      // A definition can claim a tag and still ask to be edited as source — then the box carries
      // the block's name rather than the bare word HTML
      const name = () => claimFor(area.value)?.label ?? 'HTML';
      area.spellcheck = false;
      area.value = node.attrs.html;
      area.placeholder = t('html.placeholder');
      const fit = () => {
        area.style.height = 'auto';
        area.style.height = `${area.scrollHeight}px`;
      };
      area.addEventListener('input', () => {
        fit();
        label.textContent = name();
        const pos = getPos();
        if (pos != null) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { html: area.value }));
      });
      label.textContent = name();
      removeWhenEmpty(area, () => true, remove); // an empty box has nothing else in it
      stepOut(area, editor, getPos);
      dom.append(label, escapeHint(), removeButton(remove), area);
      requestAnimationFrame(fit);
      return {
        dom,
        update: (n) => {
          if (n.type.name !== 'htmlBlock') return false;
          if (document.activeElement !== area && n.attrs.html !== area.value) {
            area.value = n.attrs.html;
            label.textContent = name();
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
 * Everything a writer typed has been escaped by this point, so a `<` at the start of a line — or
 * just inside it, since a block of HTML may be written indented — can only be one of the HTML
 * blocks above. */
const END = '(?![\\s\\S])'; // `$` would be the end of a line, since these are matched with `m`
const LITERAL = new RegExp(
  `\`\`\`[\\s\\S]*?(?:\`\`\`|${END})|~~~[\\s\\S]*?(?:~~~|${END})|\`+[^\`\\n]*\`+|^ {0,3}<[\\s\\S]*?(?=\\n[ \\t]*\\n|${END})`,
  'gm',
);

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
  const literal = new RegExp(LITERAL.source, 'gm'); // its own, since the loop moves lastIndex
  let out = '';
  let from = 0;
  for (let m = literal.exec(md); m; m = literal.exec(md)) {
    // A block the site declared runs past a blank line, and all of it is the file quoting itself
    const at = m.index + /^[ \t]*/.exec(m[0])[0].length;
    const whole = md[at] === '<' ? wholeElement(md.slice(at)) : null;
    const longer = whole && at + whole.length > m.index + m[0].length;
    const text = longer ? md.slice(m.index, at) + whole : m[0];
    out += unescape(md.slice(from, m.index)) + text;
    from = m.index + text.length;
    literal.lastIndex = from;
  }
  return (out + unescape(md.slice(from))).replace(/^(?:\s*&nbsp;\s*\n)+/, '').replace(/(?:\n\s*&nbsp;\s*)+\s*$/, '\n');
}
