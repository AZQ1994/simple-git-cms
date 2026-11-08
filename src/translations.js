// The languages of an article as the editor shows them: one row in the list for each article,
// whichever languages it has, and the language bar above the title. The files stay one per
// language (integrations/languages.js); this is only how they are put together on screen.
import { splitName } from '../integrations/languages.js';

/**
 * The list's rows: one per article, with each of its languages under `versions`. `primary` is the
 * version the row shows — the first language when the article has it, otherwise the first it has.
 * On a site in one language every file is a row of its own, as it always was.
 * @param {{ id: string, date: string }[]} articles Newest first.
 * @param {string[]} languages From languagesOf; empty for one language.
 * @returns {{ id: string, primary: object, versions: Record<string, object> }[]}
 */
export function groupArticles(articles, languages) {
  if (!languages.length) return articles.map((a) => ({ id: a.id, primary: a, versions: {} }));
  const rows = new Map();
  for (const a of articles) {
    const { id, lang } = splitName(a.id, languages);
    if (!rows.has(id)) rows.set(id, { id, versions: {} });
    rows.get(id).versions[lang] = a;
  }
  const out = [...rows.values()];
  for (const row of out) row.primary = row.versions[languages[0]] ?? languages.map((l) => row.versions[l]).find(Boolean);
  return out.sort((a, b) => String(b.primary.date).localeCompare(String(a.primary.date)));
}

/** Which article and language the open one is: a saved file by its id, a new translation by the
 * file it will become. Null for a new article, which has no id until it is saved. */
export function whereIs(current, languages) {
  const name = current?.id ?? current?.target;
  return name ? splitName(name, languages) : null;
}

/** What a new translation starts as: the article's date and cover, and nothing to translate yet. */
export function newTranslation(source, target, coverField) {
  const extra = {};
  if (coverField && source.extra?.[coverField] !== undefined) extra[coverField] = structuredClone(source.extra[coverField]);
  return { id: null, target, sha: null, title: '', description: '', date: source.date, tags: [], draft: true, extra, body: '' };
}
