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
// source file at the time, and a short hash of its words (`translatedFrom: { lang, sha, words }` in
// its frontmatter). When the source's words change, the translation is out of date — known without
// a server or a database. A save that leaves the words alone (a new date, published, a new cover)
// changes the file's hash but not the words', and the translation stays current. Since git keeps
// every version, the source as it was can be read back by its hash, to show what changed.
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

/** The id of one language of an article: its file name without `.md`. */
export const idIn = (id, lang, languages) => fileName(id, lang, languages).replace(/\.md$/, '');

/**
 * The language a new article is to be saved in, checked: none (null or undefined, which is null),
 * or one from the list — the first included, which idIn names without a suffix. Throws for anything
 * else, so nothing that isn't one of the languages ever becomes part of a file name.
 * @param {string | null | undefined} lang
 * @param {string[]} languages
 */
export function newArticleLang(lang, languages) {
  if (lang === null || lang === undefined) return null;
  if (!Array.isArray(languages) || !languages.includes(lang) || !LANG_CODE.test(lang)) throw new Error(`not one of the languages: ${lang}`);
  return lang;
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
 * The part of an article that is translated, as lines of text: title, summary, tags and body.
 * What a translation is compared with, and what is shown when the source changed.
 * @param {{ title?: string, description?: string, tags?: string[], body?: string }} a
 */
export function wordsOf(a) {
  return [a.title ?? '', a.description ?? '', (a.tags ?? []).join(', '), '', String(a.body ?? '').trim()].join('\n');
}

/** A short hash of wordsOf(a): enough to tell that the words changed, not to keep them. */
export function wordsHash(a) {
  const text = wordsOf(a);
  // cyrb53: 53 bits, synchronous, and the same in every JavaScript engine
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/**
 * Where a translation came from, as its frontmatter says; null for an article that isn't one.
 * @param {{ extra?: Record<string, unknown> }} article As parseArticle gives it.
 * @returns {{ lang: string, sha: string, words: string | null } | null}
 */
export function translatedFrom(article) {
  const t = article?.extra?.translatedFrom;
  if (!t || typeof t !== 'object' || typeof t.lang !== 'string' || typeof t.sha !== 'string') return null;
  return { lang: t.lang, sha: t.sha, words: typeof t.words === 'string' ? t.words : null };
}

/** What a translation of `source`, in language `lang`, keeps in its frontmatter. */
export const translationOf = (lang, source) => ({ lang, sha: source.sha, words: wordsHash(source) });

/**
 * Where one language of an article stands against the one it was translated from.
 * - `original`: not a translation, or one from before translations were tracked
 * - `current`: translated from the source's words as they are now
 * - `outdated`: the source's words changed since
 * - `orphan`: translated from a language the article no longer has
 * @param {{ extra?: Record<string, unknown> }} article
 * @param {Record<string, object | undefined>} versions The article's languages, by language code,
 *   as parseArticle gives them, each with `sha`, the git hash of its file.
 */
export function translationState(article, versions) {
  const from = translatedFrom(article);
  if (!from) return 'original';
  const source = versions[from.lang];
  if (!source) return 'orphan';
  if (source.sha === from.sha) return 'current';
  return from.words && from.words === wordsHash(source) ? 'current' : 'outdated';
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
