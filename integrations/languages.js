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
// Plain functions over plain data — no DOM, no network, no fs — so the editor, the tests and the
// site itself (`import … from 'simple-git-cms/languages'`) all use the same rules.
// The last part of this file is what a site needs; see integrations/astro/README.md.

/** What a language code may look like: `ja`, `zh`, `zh-Hant`, `pt-BR`. */
export const LANG_CODE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

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
