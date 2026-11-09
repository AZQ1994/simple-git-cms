// How the editor puts an article's languages together: one row in the list, and a new translation
// that starts from what the languages share.
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupArticles, newTranslation, outdatedOf, whereIs } from '../src/translations.js';

const LANGS = ['ja', 'zh'];
const a = (id, date, extra = {}) => ({ id, date, title: id, draft: false, tags: [], extra });

test('each article is one row, with every language it has', () => {
  const rows = groupArticles([a('2.zh', '2026-11-02'), a('1', '2026-11-01'), a('2', '2026-10-30'), a('3.zh', '2026-10-01')], LANGS);
  assert.deepEqual(
    rows.map((r) => [r.id, Object.keys(r.versions).sort(), r.primary.id]),
    [
      ['1', ['ja'], '1'],
      ['2', ['ja', 'zh'], '2'],
      ['3', ['zh'], '3.zh'],
    ],
    'the first language is the one shown, and the order is by its date',
  );
});

test('on a site in one language every file is a row, as before', () => {
  assert.deepEqual(
    groupArticles([a('1.zh', '2026-11-02'), a('1', '2026-11-01')], []).map((r) => r.id),
    ['1.zh', '1'],
  );
});

test('the open article knows where it is, saved or not yet', () => {
  assert.deepEqual(whereIs({ id: '1.zh' }, LANGS), { id: '1', lang: 'zh' });
  assert.deepEqual(whereIs({ id: null, target: '1.zh' }, LANGS), { id: '1', lang: 'zh' });
  // A new article: no id yet, in the language picked for it, or the first
  assert.deepEqual(whereIs({ id: null, lang: 'zh' }, LANGS), { id: null, lang: 'zh' });
  assert.deepEqual(whereIs({ id: null }, LANGS), { id: null, lang: 'ja' });
  assert.deepEqual(whereIs({ id: null, lang: 'fr' }, LANGS), { id: null, lang: 'ja' });
  assert.equal(whereIs({ id: null }, []), null);
  assert.equal(whereIs(null, LANGS), null);
});

test('a new translation starts with the date and the cover, and nothing else', () => {
  const t = newTranslation({ ...a('1', '2026-11-01T00:00:00.000Z', { image: '/u/a.webp', venue: 'Hall' }), sha: 'abc' }, '1.zh', 'image', LANGS);
  assert.equal(t.id, null);
  assert.equal(t.target, '1.zh');
  assert.equal(t.date, '2026-11-01T00:00:00.000Z');
  assert.equal(t.extra.image, '/u/a.webp');
  assert.deepEqual(Object.keys(t.extra), ['image', 'translatedFrom'], 'and the version it is a translation of');
  assert.equal(t.extra.translatedFrom.lang, 'ja');
  assert.equal(t.extra.translatedFrom.sha, 'abc');
  assert.match(t.extra.translatedFrom.words, /^[0-9a-f]{14}$/);
  assert.equal(t.title, '');
  assert.equal(t.draft, true);
});

test('a translation whose source was saved again since is outdated', () => {
  const ja = { ...a('1', '2026-11-01'), sha: 'new', body: 'now' };
  const zh = (sha) => a('1.zh', '2026-11-01', { translatedFrom: { lang: 'ja', sha } });
  assert.deepEqual(outdatedOf({ ja, zh: zh('old') }), ['zh']);
  assert.deepEqual(outdatedOf({ ja, zh: zh('new') }), []);
  assert.deepEqual(outdatedOf({ zh: zh('old') }), [], 'with its source gone there is nothing to compare');
  assert.deepEqual(outdatedOf({ ja, zh: a('1.zh', '2026-11-01') }), [], 'one written before translations were tracked is left alone');
});
