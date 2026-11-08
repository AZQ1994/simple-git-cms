// Articles in more than one language.
//
// One article is one id, and each language is a file of its own next to the others:
//
//   src/content/news/202608101200.md      the first language in `languages` (no suffix)
//   src/content/news/202608101200.zh.md   every other language: <id>.<lang>.md
//
// The first language goes without a suffix so that a site which had one language turns on a second
// without moving a file, and so that listing a directory — one request, names and hashes only —
// already says which languages each article has.
//
// A translation remembers what it was translated from: the source language and the git hash of the
// source file at the time (`translatedFrom: { lang, sha }`). When the source changes its hash no
// longer matches, which is how a translation is known to be out of date without a server or a
// database; and since git keeps every version, the source as it was then can be fetched by that
// hash and compared with the source as it is now.
//
// Plain functions over plain data — no DOM, no network, no fs — so the editor, the MCP server, the
// tests and the site itself (`import … from 'simple-git-cms/languages'`) all use the same rules.
// The last part of this file is what a site needs; see integrations/astro/README.md.

/** What a language code may look like: `ja`, `zh`, `zh-Hant`, `pt-BR`. */
export const LANG_CODE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/** Frontmatter fields that are always each language's own, whatever `shared` says. */
export const OWN_FIELDS = ['title', 'description', 'body', 'draft', 'translatedFrom'];

/**
 * The languages a collection is written in: its own `languages`, or the site's, or none.
 * @param {{ languages?: string[] }} config
 * @param {{ languages?: string[] }} [collection]
 * @returns {string[]} Empty for a site with one language; otherwise the first is the default.
 */
export function languagesOf(config, collection) {
  const list = collection?.languages ?? config?.languages ?? [];
  return list.length > 1 ? list : [];
}

/**
 * Which frontmatter fields every language of an article shares: `date` always, the cover image
 * when there is one, and whatever the collection's `shared` adds.
 * @param {{ shared?: string[], imageField?: string }} [collection]
 */
export function sharedFieldsOf(collection) {
  const fields = new Set(['date']);
  if (collection?.imageField) fields.add(collection.imageField);
  for (const f of collection?.shared ?? []) if (!OWN_FIELDS.includes(f)) fields.add(f);
  return [...fields];
}

/**
 * The file name of one language of an article.
 * @param {string} id
 * @param {string | undefined} lang
 * @param {string[]} languages From languagesOf; empty for one language.
 */
export function fileName(id, lang, languages) {
  if (!languages.length || !lang || lang === languages[0]) return `${id}.md`;
  return `${id}.${lang}.md`;
}

/**
 * Which article and which language a file is. A suffix that isn't one of the languages is part of
 * the id, so a site that never configured languages reads exactly as before.
 * @param {string} name A file name, with or without `.md`.
 * @param {string[]} languages
 * @returns {{ id: string, lang: string | null }} lang is null on a site with one language.
 */
export function splitName(name, languages) {
  const base = String(name).replace(/\.md$/, '');
  if (!languages.length) return { id: base, lang: null };
  const dot = base.lastIndexOf('.');
  if (dot > 0) {
    const suffix = base.slice(dot + 1);
    if (suffix !== languages[0] && languages.includes(suffix)) return { id: base.slice(0, dot), lang: suffix };
  }
  return { id: base, lang: languages[0] };
}

/**
 * Files grouped into articles, newest id first.
 * @param {{ id: string, oid?: string }[]} files One entry per file; `id` is the file name without .md.
 * @param {string[]} languages
 * @returns {{ id: string, files: Record<string, { name: string, oid?: string }> }[]}
 */
export function groupFiles(files, languages) {
  const byId = new Map();
  for (const f of files) {
    const { id, lang } = splitName(f.id, languages);
    const key = lang ?? '';
    if (!byId.has(id)) byId.set(id, { id, files: {} });
    byId.get(id).files[key] = { name: f.id, oid: f.oid };
  }
  return [...byId.values()].sort((a, b) => b.id.localeCompare(a.id));
}

/**
 * Where a translation came from, as its frontmatter says; null for an original.
 * @param {{ extra?: Record<string, unknown> }} article As parseArticle gives it.
 * @returns {{ lang: string, sha: string } | null}
 */
export function translatedFrom(article) {
  const t = article?.extra?.translatedFrom;
  if (!t || typeof t !== 'object' || typeof t.lang !== 'string' || typeof t.sha !== 'string') return null;
  return { lang: t.lang, sha: t.sha };
}

/**
 * Where one language of an article stands.
 * - `original`: written first, in this language; nothing to compare it with
 * - `current`: translated from the source as the source is now
 * - `outdated`: the source changed since
 * - `orphan`: translated from a language the article no longer has
 * @param {{ extra?: Record<string, unknown> }} article
 * @param {Record<string, { oid?: string }>} files The article's files by language (groupFiles).
 */
export function translationState(article, files) {
  const from = translatedFrom(article);
  if (!from) return 'original';
  const source = files[from.lang];
  if (!source) return 'orphan';
  return source.oid === from.sha ? 'current' : 'outdated';
}

/**
 * The fields of `source` that every language shares, copied onto `target`. Returns a new article;
 * neither argument is changed.
 * @param {object} target As parseArticle gives it.
 * @param {object} source
 * @param {string[]} shared From sharedFieldsOf.
 */
export function withSharedFields(target, source, shared) {
  const out = { ...target, extra: { ...target.extra } };
  for (const f of shared) {
    if (f === 'date' || f === 'tags') out[f] = Array.isArray(source[f]) ? [...source[f]] : source[f];
    else if (source.extra?.[f] === undefined) delete out.extra[f];
    else out.extra[f] = source.extra[f];
  }
  return out;
}

/** Whether two versions of one language differ in what a translator translates — not only in
 * fields every language shares. */
export function wordsChanged(before, after) {
  return before.title !== after.title || before.description !== after.description || before.body.trim() !== after.body.trim();
}

/**
 * A line-by-line comparison, for showing a translator what changed in the source: each line
 * marked ' ' (both), '-' (only before) or '+' (only after). Longest common subsequence, which is
 * plenty for an article; a pair of very long files falls back to removed-then-added.
 * @param {string} before
 * @param {string} after
 * @returns {{ op: ' ' | '-' | '+', line: string }[]}
 */
export function diffLines(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length * b.length > 4_000_000) return [...a.map((line) => ({ op: '-', line })), ...b.map((line) => ({ op: '+', line }))];
  const n = a.length;
  const m = b.length;
  // lcs[i][j]: how long a common run a[i..] and b[j..] have, filled from the end
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) (out.push({ op: ' ', line: a[i] }), i++, j++);
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ op: '-', line: a[i++] });
    else out.push({ op: '+', line: b[j++] });
  }
  while (i < n) out.push({ op: '-', line: a[i++] });
  while (j < m) out.push({ op: '+', line: b[j++] });
  return out;
}

/** The parts of an article a translator works on, as one text, for diffLines. */
export const wordsOf = (a) => [`# ${a.title}`, ...(a.description ? ['', `> ${a.description}`] : []), '', a.body.trim()].join('\n');

// ---------------------------------------------------------------------------------------------
// For the site.

/**
 * An id for Astro's glob loader that keeps the file name as it is. The default turns
 * `202608101200.zh` into `202608101200zh`, which can no longer be split into id and language:
 *   loader: glob({ pattern: '*.md', base: './src/content/news', generateId: fileId })
 * @param {{ entry: string }} o
 */
export const fileId = ({ entry }) => entry.replace(/\.md$/, '');

/**
 * Every language of the article an entry belongs to, by language code — for a language switcher
 * and `<link rel="alternate" hreflang>`.
 * @template {{ id: string }} E
 * @param {E[]} entries The collection, e.g. from getCollection('news').
 * @param {string} id Any entry's id: `202608101200` or `202608101200.zh`.
 * @param {string[]} languages The same list as config.json's `languages`.
 * @returns {Record<string, E>}
 */
export function translationsOf(entries, id, languages) {
  const want = splitName(id, languages).id;
  const out = {};
  for (const e of entries) {
    const { id: base, lang } = splitName(e.id, languages);
    if (base === want) out[lang ?? ''] = e;
  }
  return out;
}

/**
 * Entries in one language, each with the article id and language split out — what a list page or
 * getStaticPaths wants.
 * @template {{ id: string }} E
 * @param {E[]} entries
 * @param {string} lang
 * @param {string[]} languages
 * @returns {(E & { articleId: string, lang: string })[]}
 */
export function inLanguage(entries, lang, languages) {
  return entries.flatMap((e) => {
    const split = splitName(e.id, languages);
    return split.lang === lang ? [{ ...e, articleId: split.id, lang }] : [];
  });
}
