// 文章文件格式：YAML frontmatter + Markdown 正文。
// 没有在编辑器里出现的字段（如 legacy）原样保留。
import YAML from 'yaml';

export function parseArticle(id, text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const data = m ? YAML.parse(m[1]) ?? {} : {};
  const body = (m ? m[2] : text).trim() + '\n';
  const { title = '', description = '', date, tags = [], draft = false, ...extra } = data;
  return {
    id,
    title: String(title),
    description: String(description ?? ''),
    date: date ? new Date(date).toISOString() : new Date().toISOString(),
    tags: Array.isArray(tags) ? tags.map(String) : [],
    draft: Boolean(draft),
    extra,
    body,
  };
}

const q = (s) => JSON.stringify(String(s)); // JSON 字符串即合法的 YAML 字符串

export function excerpt(md, len = 110) {
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
