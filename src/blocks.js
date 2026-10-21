// Blocks a site defines for itself: a YouTube embed, a notice box, whatever that site's Markdown
// already contains. Each one is a template with {placeholders} in it, written in config.json —
// the editor reads the template to recognise the thing in a file, and writes it back through the
// same template, so nothing here knows what YouTube is.
//
//   { "name": "youtube", "label": "YouTube", "template": "<YouTube id=\"{id}\" />" }
//
// The fields follow from the template unless they are spelled out, which is only needed to give
// them a label, a placeholder, or room for more than one line.

const FIELD = /\{([a-zA-Z][\w-]*)\}/g;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let defs = [];

/** Set from config.blocks. Anything that isn't a usable definition is dropped. */
export function setBlocks(list) {
  defs = (Array.isArray(list) ? list : []).filter((b) => b?.name && typeof b.template === 'string').map(prepare);
}

export const blocks = () => defs;
export const blockNamed = (name) => defs.find((b) => b.name === name);

function prepare(raw) {
  const names = [...raw.template.matchAll(FIELD)].map((m) => m[1]);
  const spelled = Array.isArray(raw.fields) ? raw.fields : [];
  const fields = [...new Set(names)].map((name) => ({ name, label: name, ...spelled.find((f) => f?.name === name) }));
  // The template, made into something that recognises itself: everything literal, each
  // {placeholder} a group that stops at whatever follows it.
  const pattern = raw.template
    .split(FIELD)
    .map((part, i) => (i % 2 ? '([\\s\\S]*?)' : escapeRe(part)))
    .join('');
  return { ...raw, label: raw.label || raw.name, fields, names, match: new RegExp(`^${pattern}$`) };
}

/** The block this piece of a file is, if it is one of them. */
export function matchBlock(text) {
  const trimmed = text.trim();
  for (const def of defs) {
    const m = def.match.exec(trimmed);
    if (!m) continue;
    const values = {};
    def.names.forEach((name, i) => (values[name] = m[i + 1].trim()));
    return { block: def.name, values, raw: trimmed };
  }
  return null;
}

/** A block back as the file spells it. Falls back to what was read, so that turning a definition
 * off in config.json cannot quietly delete what it used to describe. */
export function fillBlock({ block, values = {}, raw = '' }) {
  const def = blockNamed(block);
  if (!def) return raw;
  return def.template.replace(FIELD, (_, name) => values[name] ?? '');
}

/** Fill in a template of the same shape — a preview address, say. */
export const fillTemplate = (template, values = {}) => String(template ?? '').replace(FIELD, (_, name) => encodeURIComponent(values[name] ?? ''));
