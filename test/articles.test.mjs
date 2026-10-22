// Loading the list: what gets downloaded, in what order, and what the browser already had.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadArticles } from '../src/articles.js';

const md = (title, date) => `---\ntitle: "${title}"\ndate: ${date}\n---\n\n${title} の本文\n`;

/** Five articles whose ids and dates disagree, so the order can only come from the frontmatter. */
const collection = () =>
  new Map([
    ['202601010000', md('一', '2026-03-01T00:00:00.000Z')],
    ['202602020000', md('二', '2026-01-01T00:00:00.000Z')],
    ['202603030000', md('三', '2026-05-01T00:00:00.000Z')],
    ['202604040000', md('四', '2026-02-01T00:00:00.000Z')],
    ['202605050000', md('五', '2026-04-01T00:00:00.000Z')],
  ]);

// The oid is git's hash of the contents, so here it is simply the text's own identity
const oidOf = (text) => `oid:${text.length}:${text.slice(10, 14)}`;

function fakeStore(files) {
  const reads = [];
  return {
    repo: 'o/r',
    contentDir: 'site/news',
    reads,
    listFiles: async () =>
      [...files.keys()].sort((a, b) => b.localeCompare(a)).map((id) => ({ id, oid: oidOf(files.get(id)) })),
    readFiles: async (ids) => {
      reads.push(ids);
      return new Map(ids.filter((id) => files.has(id)).map((id) => [id, files.get(id)]));
    },
  };
}

function fakeCache(entries = []) {
  const kept = new Map(entries);
  return {
    kept,
    read: async () => new Map(kept),
    write: (_scope, oid, text) => kept.set(oid, text),
    prune: (_scope, oids) => {
      for (const oid of [...kept.keys()]) if (!oids.includes(oid)) kept.delete(oid);
    },
  };
}

test('the text arrives a batch at a time, and the list is newest first by its date', async () => {
  const files = collection();
  const store = fakeStore(files);
  const steps = [];
  const articles = await loadArticles(store, { cache: fakeCache(), batch: 2, onBatch: (list, left) => steps.push([list.length, left]) });

  assert.deepEqual(store.reads, [
    ['202605050000', '202604040000'],
    ['202603030000', '202602020000'],
    ['202601010000'],
  ], 'two at a time, newest file first');
  assert.deepEqual(steps, [[0, 5], [2, 3], [4, 1], [5, 0]], 'the list is reported as it fills in');
  assert.deepEqual(articles.map((a) => a.title), ['三', '五', '一', '四', '二'], 'by the date in the frontmatter');
  assert.deepEqual(articles.map((a) => a.sha), articles.map((a) => oidOf(files.get(a.id))), 'the content hash is the version');
});

test('a second visit downloads nothing: the hash of the contents is the key', async () => {
  const files = collection();
  const cache = fakeCache();
  await loadArticles(fakeStore(files), { cache, batch: 2 });

  const again = fakeStore(files);
  const steps = [];
  const articles = await loadArticles(again, { cache, batch: 2, onBatch: (list, left) => steps.push([list.length, left]) });
  assert.deepEqual(again.reads, [], 'nothing left to ask for');
  assert.deepEqual(steps, [[5, 0]], 'the whole list at once, from the cache');
  assert.equal(articles.length, 5);
});

test('only what changed is downloaded again, and the version left behind is forgotten', async () => {
  const files = collection();
  const cache = fakeCache();
  await loadArticles(fakeStore(files), { cache, batch: 2 });
  const before = cache.kept.size;

  files.set('202603030000', md('三、改めて', '2026-05-01T00:00:00.000Z'));
  const again = fakeStore(files);
  const articles = await loadArticles(again, { cache, batch: 2 });

  assert.deepEqual(again.reads, [['202603030000']], 'the one article that moved');
  assert.equal(articles[0].title, '三、改めて');
  assert.equal(cache.kept.size, before, 'the old version of it is not kept as well');
});

test('an article deleted between the listing and the reading is left out', async () => {
  const files = collection();
  const store = fakeStore(files);
  const list = store.listFiles;
  store.listFiles = async () => {
    const entries = await list();
    files.delete('202603030000'); // someone deletes it on GitHub, right about now
    return entries;
  };
  const articles = await loadArticles(store, { cache: fakeCache(), batch: 2 });
  assert.deepEqual(articles.map((a) => a.id), ['202605050000', '202601010000', '202604040000', '202602020000']);
});

test('an empty collection is an empty list, reported once', async () => {
  const steps = [];
  const articles = await loadArticles(fakeStore(new Map()), { cache: fakeCache(), onBatch: (list, left) => steps.push([list.length, left]) });
  assert.deepEqual(articles, []);
  assert.deepEqual(steps, [[0, 0]]);
});
