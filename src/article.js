// The article file format: YAML frontmatter plus a Markdown body. Fields the editor doesn't
// surface (a legacy one, say) are carried through untouched.
import YAML from 'yaml';

export function parseArticle(id, text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const data = m ? YAML.parse(m[1]) ?? {} : {};
  const body = (m ? m[2] : text).trim() + '\n';
  const { title = '', description = '', date, tags = [], draft = false, ...extra } = data;
  // A summary the editor generated is not the author's: it is left empty here, so the field shows
  // it is automatic and the next save takes it from the body as it is then
  const desc = String(description ?? '');
  const generated = desc && (desc === excerpt(body) || desc === oldExcerpt(body));
  return {
    id,
    title: String(title),
    description: generated ? '' : desc,
    date: date ? new Date(date).toISOString() : new Date().toISOString(),
    tags: Array.isArray(tags) ? tags.map(String) : [],
    draft: Boolean(draft),
    extra,
    body,
  };
}

const q = (s) => JSON.stringify(String(s)); // a JSON string is also a valid YAML string

/** The start of the body as plain text: what a search result shows when no summary was written.
 * Markup, code and tables are not prose, so they are left out; the text inside a tag stays. */
export function excerpt(md, len = 110) {
  const text = md
    .replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|table)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .replace(/^ *\|.*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^ {0,3}(?:#{1,6} +|(?:> ?)+|[-*+] +|\d+[.)] +)/gm, '')
    .replace(/(\*\*|\*|~~|`)(\S(?:[\s\S]*?\S)?)\1/g, '$2')
    // Underscores only in pairs that stand apart from a word, so snake_case keeps its own
    .replace(/(^|[^\w])(__?)(\S(?:[\s\S]*?\S)?)\2(?!\w)/g, '$1$3')
    .replace(/[*`]/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = [...text]; // so an emoji is never cut in half
  if (chars.length <= len) return text;
  const cut = chars.slice(0, len).join('');
  // A word in a language that spaces its words is not stopped halfway either
  if (/\w/.test(chars[len]) && /\w$/.test(cut)) {
    const space = cut.lastIndexOf(' ');
    if (space > len * 0.6) return cut.slice(0, space);
  }
  return cut;
}

// How excerpt worked up to 0.9.0. A summary it wrote is still recognised as generated, so those
// articles start following their body too.
function oldExcerpt(md, len = 110) {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*>_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, len);
}

export function serializeArticle(a) {
  const lines = [
    '---',
    `title: ${q(a.title)}`,
    `description: ${q(a.description || excerpt(a.body))}`,
    `date: ${new Date(a.date).toISOString()}`,
    `tags: [${a.tags.map(q).join(', ')}]`,
  ];
  if (a.draft) lines.push('draft: true');
  for (const [k, v] of Object.entries(a.extra ?? {})) {
    if (v === undefined || v === null) continue;
    lines.push(YAML.stringify({ [k]: v }).trimEnd());
  }
  lines.push('---', '', a.body.trim(), '');
  return lines.join('\n');
}
