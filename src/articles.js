// Loading the article list.
//
// The list only needs each article's frontmatter — title, date, draft, tags — but GitHub has no
// way to send part of a file: a blob is all of it or none of it. So the list is read in two
// steps. First which files there are, which is small and stays small. Then their text, newest
// first and a batch at a time, so the list appears after the first batch instead of after the
// last one; and only for the files this browser hasn't already got, which after the first visit
// is usually none of them.
import { parseArticle } from './article.js';
import * as bodies from './cache.js';

/** How many articles' text to ask for in one request. Small enough that the first batch arrives
 * quickly, large enough that a few hundred articles don't mean a few hundred requests. */
export const BATCH = 50;

const scopeOf = (store) => `${store.repo}:${store.contentDir}`;

/** Keep the text of an article this editor has just committed, under the hash the commit gave it.
 * Without this, the one article someone edited is the one thing the next visit has to download. */
export const rememberBody = (store, sha, text) => {
  if (sha && text) bodies.write(scopeOf(store), sha, text);
};

/**
 * Read the whole list, reporting it as it fills in.
 * @param {object} store The GitHubStore to read from.
 * @param {object} [o]
 * @param {(articles: object[], left: number) => void} [o.onBatch] Called with every version of
 * the list, newest article first, and how many are still to come.
 * @param {number} [o.batch]
 * @param {object} [o.cache] Where downloaded bodies are kept; the IndexedDB one by default.
 * @returns {Promise<object[]>} The complete list.
 */
export async function loadArticles(store, { onBatch = () => {}, batch = BATCH, cache = bodies } = {}) {
  const files = await store.listFiles();
  const scope = scopeOf(store);
  const have = (await cache.read(scope)) ?? new Map();

  const articles = [];
  const missing = [];
  const add = (file, text) => articles.push({ ...parseArticle(file.id, text), sha: file.oid });
  for (const file of files) (have.has(file.oid) ? add(file, have.get(file.oid)) : missing.push(file));

  // The id orders the files, but the list is ordered by the date in the frontmatter, which can be
  // anything the person typed into it
  const sorted = () => [...articles].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  let left = missing.length;
  if (left) onBatch(sorted(), left); // whatever the cache already had, before asking for anything
  for (let i = 0; i < missing.length; i += batch) {
    const next = missing.slice(i, i + batch);
    const texts = await store.readFiles(next.map((f) => f.id));
    for (const file of next) {
      const text = texts.get(file.id);
      if (text === undefined) continue; // deleted between the listing and now
      add(file, text);
      cache.write(scope, file.oid, text);
    }
    left -= next.length;
    onBatch(sorted(), left);
  }
  if (!missing.length) onBatch(sorted(), 0); // nothing to download: the cache was the whole list
  cache.prune(scope, files.map((f) => f.oid));
  return sorted();
}
