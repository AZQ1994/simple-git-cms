// How the editor puts an article's languages together: one row in the list, and a new translation
// that starts from what the languages share.
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupArticles, newTranslation, whereIs } from '../src/translations.js';

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
  assert.equal(whereIs({ id: null }, LANGS), null);
});

test('a new translation starts with the date and the cover, and nothing else', () => {
  const t = newTranslation(a('1', '2026-11-01T00:00:00.000Z', { image: '/u/a.webp', venue: 'Hall' }), '1.zh', 'image');
  assert.equal(t.id, null);
  assert.equal(t.target, '1.zh');
  assert.equal(t.date, '2026-11-01T00:00:00.000Z');
  assert.deepEqual(t.extra, { image: '/u/a.webp' });
  assert.equal(t.title, '');
  assert.equal(t.draft, true);
});
