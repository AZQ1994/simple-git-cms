// Blocks a site defines for itself. Markdown here is Markdown plus HTML, so a block is an HTML
// element: <YouTube id="…" />, <aside class="notice">…</aside>, <table>, whatever a site's layout
// already renders. config.json names the tag, and the editor gives that tag a place in the insert
// menu and an editor of its own. An element no definition claims stays plain HTML, editable as
// source, which is what the editor did with all of them before.
//
//   { "tag": "YouTube", "label": "YouTube", "fields": [{ "name": "id", "label": "Video ID" }] }
//
// `edit` says which editor the block gets, since a form is not the right shape for everything:
//
//   fields  a small form, one row per attribute — the default
//   table   the table editor: rows, columns, alignment, and cells that span more than one
//   source  the element's own HTML, in a box with the block's name on it

const NAME = /^[a-zA-Z][\w:-]*$/;
const KINDS = ['fields', 'table', 'source'];
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decode = (text) =>
  text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, name) =>
    name[0] === '#' ? String.fromCodePoint(Number(name[1] === 'x' || name[1] === 'X' ? `0${name.slice(1)}` : name.slice(1))) : (ENTITIES[name.toLowerCase()] ?? m),
  );
const encode = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let defs = [];

/** Set from config.blocks. A definition that could not work is left out rather than half-applied. */
export function setBlocks(list) {
  defs = (Array.isArray(list) ? list : [])
    .filter((b) => NAME.test(b?.tag ?? ''))
    .map((b) => ({
      ...b,
      name: b.name || b.tag,
      label: b.label || b.tag,
      edit: KINDS.includes(b.edit) ? b.edit : 'fields',
      attrs: b.attrs && typeof b.attrs === 'object' ? b.attrs : {},
      fields: (Array.isArray(b.fields) ? b.fields : []).filter((f) => f?.name),
    }));
}

export const blocks = () => defs;
export const blockNamed = (name) => defs.find((b) => b.name === name);
/** The definition, if there is one, that makes tables editable as tables rather than as source. */
export const tableBlock = () => defs.find((b) => b.edit === 'table');

/** The field that stands for what is between the tags, if the definition has one. */
const contentField = (def) => def.fields.find((f) => f.from === 'content');

/** One HTML element, taken apart. Null for anything that is not exactly one element. */
export function readElement(html) {
  const source = html.trim();
  const open = /^<([a-zA-Z][\w:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)(\/?)>/.exec(source);
  if (!open) return null;
  const [, tag, rest, selfClosing] = open;
  const after = source.slice(open[0].length);

  let content = null;
  if (!selfClosing) {
    const close = new RegExp(`</${tag}\\s*>$`, 'i');
    if (!close.test(after)) return null; // not one element: it ends somewhere else
    content = after.replace(close, '');
    if (new RegExp(`<${tag}\\b`, 'i').test(content)) return null; // one of the same inside it
  } else if (after.trim()) {
    return null;
  }

  const attrs = {};
  for (const m of rest.matchAll(/([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    attrs[m[1]] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return { tag, attrs, content };
}

/** How far a declared block's element runs, from the start of `src`, when the file writes it
 * across blank lines. Markdown ends a block of HTML at the first blank line, which would leave the
 * closing tag stranded in the text; a tag the site has declared is one element, blank lines and
 * all. Null for everything else, which keeps Markdown's own rules. */
export function wholeElement(src) {
  const open = /^<([a-zA-Z][\w:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)(\/?)>/.exec(src);
  if (!open || open[3]) return null; // nothing after a self-closing tag to look for
  const tag = open[1];
  if (!defs.some((def) => def.tag.toLowerCase() === tag.toLowerCase())) return null;
  const close = new RegExp(`</${tag}\\s*>`, 'i').exec(src.slice(open[0].length));
  if (!close) return null; // never closed: leave it to be read as whatever it is
  const raw = src.slice(0, open[0].length + close.index + close[0].length);
  // Without a blank line in it, Markdown already reads the element whole, and reading it any
  // other way here would change where the element is said to end
  return /\n[ \t]*\n/.test(raw) ? raw : null;
}

/** Whether a definition speaks for this element: its tag, and every attribute it insists on. */
const claims = (def, el) => def.tag.toLowerCase() === el.tag.toLowerCase() && Object.entries(def.attrs).every(([k, v]) => el.attrs[k] === v);

/** The definition that claims this piece of HTML, whatever it then does with it. */
export function claimFor(html) {
  const el = readElement(html ?? '');
  return (el && defs.find((def) => claims(def, el))) || null;
}

/** The block this piece of HTML is, as values for a form. Only for definitions edited that way. */
export function matchBlock(html) {
  const el = readElement(html ?? '');
  if (!el) return null;
  for (const def of defs) {
    if (!claims(def, el) || def.edit !== 'fields') continue;
    const content = contentField(def);
    // Everything the element says has to have somewhere to live, or editing it would lose
    // something: content with no field for it means this stays plain HTML.
    if (el.content?.trim() && !content) continue;
    const values = { ...el.attrs };
    if (content) values[content.name] = el.content ?? '';
    return { block: def.name, values, raw: html.trim() };
  }
  return null;
}

const attrsText = (attrs) =>
  Object.entries(attrs)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => ` ${k}="${encode(v)}"`)
    .join('');

/** A block back as the file spells it. Falls back to what was read, so that turning a definition
 * off in config.json cannot quietly delete what it used to describe. */
export function fillBlock({ block, values = {}, raw = '' }) {
  const def = blockNamed(block);
  if (!def) return raw;
  const content = contentField(def);
  const written = { ...def.attrs, ...values };
  if (content) delete written[content.name];
  const attrs = attrsText(written);
  const inner = content ? (values[content.name] ?? '') : '';
  return content ? `<${def.tag}${attrs}>${inner}</${def.tag}>` : `<${def.tag}${attrs} />`;
}

/** The empty element a definition describes — what inserting one from the menu starts you with. */
export const emptyElement = (def) => `<${def.tag}${attrsText(def.attrs)}></${def.tag}>`;

/** What the editor shows for a block: every field it defines, plus any attribute the file had
 * that the definition never mentioned — so nothing is editable only by hand. */
export function blockFields(def, values = {}) {
  const named = new Set(def.fields.map((f) => f.name));
  const extra = Object.keys(values)
    .filter((k) => !named.has(k) && !(k in def.attrs))
    .map((name) => ({ name, label: name }));
  return [...def.fields.map((f) => ({ label: f.name, ...f })), ...extra];
}

/** Fill in a template of the same shape — a preview address, say. */
export const fillTemplate = (template, values = {}) => String(template ?? '').replace(/\{([a-zA-Z][\w-]*)\}/g, (_, name) => encodeURIComponent(values[name] ?? ''));
