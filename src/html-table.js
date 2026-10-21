// An HTML table in a Markdown file, read as a table rather than as a wall of source.
//
// GitHub and most Markdown pipelines pass <table> through untouched, which is how a site writes
// the things a pipe table cannot say: merged cells, a header that spans two columns, a width.
// This reads that markup into the same node the editor uses for pipe tables, and writes it back.
//
// It is deliberately narrow. Anything it cannot reproduce exactly — a tag it doesn't know, a
// nested table, two paragraphs in one cell — makes it give up, and the file keeps its raw HTML
// block instead. Giving up is the safe answer; guessing is not.

const VOID = new Set(['br']);
const MARKS = { strong: 'bold', b: 'bold', em: 'italic', i: 'italic', code: 'code', a: 'link' };
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decode = (text) =>
  text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, name) =>
    name[0] === '#' ? String.fromCodePoint(Number(name[1] === 'x' || name[1] === 'X' ? `0${name.slice(1)}` : name.slice(1))) : (ENTITIES[name.toLowerCase()] ?? m),
  );

const encode = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The attributes of one tag, as a plain object, plus the text they were written as. */
function readAttrs(source) {
  const attrs = {};
  for (const m of source.matchAll(/([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

const alignOf = (attrs) => {
  const style = /text-align\s*:\s*(left|center|right)/i.exec(attrs.style ?? '');
  const value = (style?.[1] ?? attrs.align ?? '').toLowerCase();
  return ['left', 'center', 'right'].includes(value) ? value : null;
};

const span = (value) => {
  const n = Number(value ?? 1);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
};

/** What is left once the parts we understand are taken out, to make sure nothing was. */
const onlySpace = (text) => !text.trim();

/** A cell's contents as inline nodes, or null if it holds something this cannot put back. */
function readInline(html) {
  const content = [];
  const marks = [];
  let at = 0;
  const text = (raw) => {
    if (!raw) return;
    const last = content.at(-1);
    const value = decode(raw);
    if (last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(marks)) last.text += value;
    else content.push(marks.length ? { type: 'text', text: value, marks: [...marks] } : { type: 'text', text: value });
  };

  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)\/?>/g)) {
    const [tag, closing, name, rest] = [m[0], m[1] === '/', m[2].toLowerCase(), m[3]];
    text(html.slice(at, m.index));
    at = m.index + tag.length;
    if (VOID.has(name)) {
      content.push({ type: 'hardBreak' });
      continue;
    }
    const mark = MARKS[name];
    if (!mark) return null; // a tag we would not be able to write back
    if (!closing) marks.push(mark === 'link' ? { type: 'link', attrs: { href: readAttrs(rest).href ?? '' } } : { type: mark });
    else if (marks.at(-1)?.type === mark) marks.pop();
    else return null; // tags that overlap rather than nest
  }
  text(html.slice(at));
  return marks.length ? null : content.filter((n) => n.type !== 'text' || n.text !== '');
}

/**
 * An HTML table as the editor's table node, or null when it is anything this cannot reproduce.
 * `html` is the raw block exactly as the file has it.
 */
export function parseHtmlTable(html) {
  const source = html.trim();
  const outer = /^<table((?:[^<>"']|"[^"]*"|'[^']*')*)>([\s\S]*)<\/table>$/i.exec(source);
  if (!outer) return null;
  const inner = outer[2];
  if (/<table\b/i.test(inner)) return null; // a table inside a table

  // thead/tbody/tfoot say nothing a row doesn't, so they are dropped — but only when they carry
  // no attributes of their own
  const rowsOnly = inner.replace(/<\/?(?:thead|tbody|tfoot)\s*>/gi, '');
  if (/<(?:thead|tbody|tfoot)\b/i.test(rowsOnly)) return null;

  const rows = [];
  let after = 0;
  for (const m of rowsOnly.matchAll(/<tr((?:[^<>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/tr>/gi)) {
    if (!onlySpace(rowsOnly.slice(after, m.index))) return null;
    after = m.index + m[0].length;
    if (Object.keys(readAttrs(m[1])).length) return null; // a row that says something of its own

    const cells = [];
    let next = 0;
    for (const c of m[2].matchAll(/<(th|td)((?:[^<>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1>/gi)) {
      if (!onlySpace(m[2].slice(next, c.index))) return null;
      next = c.index + c[0].length;
      const attrs = readAttrs(c[2]);
      const [colspan, rowspan] = [span(attrs.colspan), span(attrs.rowspan)];
      if (!colspan || !rowspan) return null;
      if (Object.keys(attrs).some((k) => !['colspan', 'rowspan', 'align', 'style'].includes(k))) return null;
      if (attrs.style && !/^\s*text-align\s*:\s*(left|center|right)\s*;?\s*$/i.test(attrs.style)) return null;
      const content = readInline(c[3]);
      if (!content) return null;
      cells.push({
        type: c[1].toLowerCase() === 'th' ? 'tableHeader' : 'tableCell',
        attrs: { colspan, rowspan, align: alignOf(attrs) },
        content: [{ type: 'paragraph', content }],
      });
    }
    if (!cells.length || !onlySpace(m[2].slice(next))) return null;
    rows.push({ type: 'tableRow', content: cells });
  }
  if (!rows.length || !onlySpace(rowsOnly.slice(after))) return null;
  if (Object.keys(readAttrs(outer[1])).length) return null; // a table with attributes of its own

  return { type: 'table', attrs: { format: 'html' }, content: rows };
}

const TAGS = { bold: 'strong', italic: 'em', code: 'code' };

/** Inline nodes back as HTML. */
function writeInline(content = []) {
  let out = '';
  let open = [];
  for (const node of content) {
    if (node.type === 'hardBreak') {
      for (const m of open.reverse()) out += `</${m.type === 'link' ? 'a' : TAGS[m.type]}>`;
      open = [];
      out += '<br>';
      continue;
    }
    if (node.type !== 'text') continue;
    const marks = node.marks ?? [];
    // Close what this piece of text is not inside any more, then open what is new
    const same = open.findIndex((m, i) => JSON.stringify(m) !== JSON.stringify(marks[i]));
    const keep = same === -1 ? Math.min(open.length, marks.length) : same;
    for (const m of open.slice(keep).reverse()) out += `</${m.type === 'link' ? 'a' : TAGS[m.type]}>`;
    for (const m of marks.slice(keep)) out += m.type === 'link' ? `<a href="${encode(m.attrs?.href ?? '')}">` : `<${TAGS[m.type]}>`;
    open = [...marks];
    out += encode(node.text ?? '');
  }
  for (const m of open.reverse()) out += `</${m.type === 'link' ? 'a' : TAGS[m.type]}>`;
  return out;
}

/** The editor's table node as HTML, laid out the same way every time. */
export function writeHtmlTable(node) {
  const lines = ['<table>'];
  for (const row of node.content ?? []) {
    lines.push('  <tr>');
    for (const cell of row.content ?? []) {
      const tag = cell.type === 'tableHeader' ? 'th' : 'td';
      const attrs = [
        cell.attrs?.colspan > 1 ? ` colspan="${cell.attrs.colspan}"` : '',
        cell.attrs?.rowspan > 1 ? ` rowspan="${cell.attrs.rowspan}"` : '',
        cell.attrs?.align ? ` style="text-align: ${cell.attrs.align}"` : '',
      ].join('');
      lines.push(`    <${tag}${attrs}>${writeInline(cell.content?.[0]?.content)}</${tag}>`);
    }
    lines.push('  </tr>');
  }
  lines.push('</table>');
  return lines.join('\n');
}

/** Whether a table has to be written as HTML: a pipe table cannot merge cells. */
export const needsHtml = (node) => (node.content ?? []).some((row) => (row.content ?? []).some((c) => c.attrs?.colspan > 1 || c.attrs?.rowspan > 1));
