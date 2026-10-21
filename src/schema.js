// What a document may contain, and how each part is written back as Markdown. Kept apart from the
// editor itself because none of it touches the DOM, so the whole Markdown round-trip can be tested
// in Node rather than only in a browser.
import StarterKit from '@tiptap/starter-kit';
import Paragraph from '@tiptap/extension-paragraph';
import { Markdown } from '@tiptap/markdown';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';

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

/** Everything the document is made of, bar the image node, which needs the browser. */
export const schemaExtensions = [
  StarterKit.configure({ paragraph: false, heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true }, codeBlock: false, code: false }),
  SiteParagraph,
  SiteTable,
  TableRow,
  SiteTableCell,
  SiteTableHeader,
  Markdown,
];

/** The serializer's output, as it should be written to the file. An & is written out as &amp;,
 * which looks the same but should go back as &. Blank lines at the very start and end are dropped
 * — inserting an image always leaves one. */
export const cleanMarkdown = (md) =>
  md
    .replace(/&amp;(?![a-zA-Z]+;|#\d+;)/g, '&')
    .replace(/^(?:\s*&nbsp;\s*\n)+/, '')
    .replace(/(?:\n\s*&nbsp;\s*)+\s*$/, '\n');
