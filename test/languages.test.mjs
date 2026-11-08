// Articles in several languages: which file is which language, where a translation stands, and
// what every language shares. Plain functions, so every case is a line or two.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diffLines,
  fileName,
  fileId,
  groupFiles,
  inLanguage,
  languagesOf,
  sharedFieldsOf,
  splitName,
  translationState,
  translationsOf,
  withSharedFields,
  wordsChanged,
} from '../integrations/languages.js';

const LANGS = ['ja', 'zh'];

test('the first language has no suffix, so a site that had one language keeps its files', () => {
  assert.equal(fileName('202608101200', 'ja', LANGS), '202608101200.md');
  assert.equal(fileName('202608101200', 'zh', LANGS), '202608101200.zh.md');
  assert.equal(fileName('202608101200', null, []), '202608101200.md');
  assert.deepEqual(splitName('202608101200.md', LANGS), { id: '202608101200', lang: 'ja' });
  assert.deepEqual(splitName('202608101200.zh', LANGS), { id: '202608101200', lang: 'zh' });
});

test('a suffix that is not a configured language is part of the id', () => {
  assert.deepEqual(splitName('2026-report.en', LANGS), { id: '2026-report.en', lang: 'ja' });
  assert.deepEqual(splitName('202608101200.zh', []), { id: '202608101200.zh', lang: null });
  // Naming the default language in a suffix is not a second copy of it
  assert.deepEqual(splitName('202608101200.ja', LANGS), { id: '202608101200.ja', lang: 'ja' });
});

test('one language configured is the same as none', () => {
  assert.deepEqual(languagesOf({ languages: ['ja'] }), []);
  assert.deepEqual(languagesOf({ languages: LANGS }), LANGS);
  assert.deepEqual(languagesOf({ languages: LANGS }, { languages: ['ja'] }), []);
  assert.deepEqual(languagesOf({}, { languages: ['zh', 'ja'] }), ['zh', 'ja']);
});

test('files are grouped into articles, newest first', () => {
  const groups = groupFiles(
    [
      { id: '202601010000', oid: 'a' },
      { id: '202608101200', oid: 'b' },
      { id: '202608101200.zh', oid: 'c' },
      { id: '202105061030.zh', oid: 'd' },
    ],
    LANGS,
  );
  assert.deepEqual(
    groups.map((g) => [g.id, Object.keys(g.files).sort()]),
    [
      ['202608101200', ['ja', 'zh']],
      ['202601010000', ['ja']],
      ['202105061030', ['zh']],
    ],
  );
});

test('a translation is current while its source is the version it was made from', () => {
  const files = { ja: { oid: 'aaa' }, zh: { oid: 'bbb' } };
  const zh = (sha, lang = 'ja') => ({ extra: { translatedFrom: { lang, sha } } });
  assert.equal(translationState({ extra: {} }, files), 'original');
  assert.equal(translationState(zh('aaa'), files), 'current');
  assert.equal(translationState(zh('old'), files), 'outdated');
  assert.equal(translationState(zh('aaa', 'en'), files), 'orphan');
  // Something else in the field is not taken for a translation
  assert.equal(translationState({ extra: { translatedFrom: 'ja' } }, files), 'original');
});

test('date and the cover image are always shared; the words never are', () => {
  assert.deepEqual(sharedFieldsOf({ imageField: 'image' }), ['date', 'image']);
  assert.deepEqual(sharedFieldsOf({ shared: ['tags', 'title', 'category'] }), ['date', 'tags', 'category']);
});

test('shared fields are copied over, and one the source lacks is removed', () => {
  const target = { title: '中文', date: '2026-01-01T00:00:00.000Z', tags: ['a'], extra: { image: '/old.webp', note: 'x' }, body: '正文\n' };
  const source = { title: '日本語', date: '2026-02-02T00:00:00.000Z', tags: ['b'], extra: {}, body: '本文\n' };
  const out = withSharedFields(target, source, ['date', 'image', 'tags']);
  assert.equal(out.date, source.date);
  assert.deepEqual(out.tags, ['b']);
  assert.equal(out.extra.image, undefined);
  assert.equal(out.extra.note, 'x');
  assert.equal(out.title, '中文');
  assert.equal(target.extra.image, '/old.webp', 'the target itself is left alone');
});

test('only the words count as a change a translator has to follow', () => {
  const a = { title: 'T', description: '', body: 'B\n', date: '1' };
  assert.equal(wordsChanged(a, { ...a, date: '2' }), false);
  assert.equal(wordsChanged(a, { ...a, body: 'B' }), false);
  assert.equal(wordsChanged(a, { ...a, body: 'C\n' }), true);
  assert.equal(wordsChanged(a, { ...a, title: 'U' }), true);
});

test('the diff shows lines removed and added, in order', () => {
  assert.deepEqual(diffLines('a\nb\nc', 'a\nB\nc\nd'), [
    { op: ' ', line: 'a' },
    { op: '-', line: 'b' },
    { op: '+', line: 'B' },
    { op: ' ', line: 'c' },
    { op: '+', line: 'd' },
  ]);
  assert.deepEqual(diffLines('same', 'same'), [{ op: ' ', line: 'same' }]);
});

test('the site keeps file names whole, and finds every language of an article', () => {
  assert.equal(fileId({ entry: '202608101200.zh.md' }), '202608101200.zh');
  const entries = [{ id: '202608101200' }, { id: '202608101200.zh' }, { id: '202601010000' }];
  assert.deepEqual(Object.keys(translationsOf(entries, '202608101200.zh', LANGS)).sort(), ['ja', 'zh']);
  assert.deepEqual(
    inLanguage(entries, 'ja', LANGS).map((e) => [e.id, e.articleId]),
    [
      ['202608101200', '202608101200'],
      ['202601010000', '202601010000'],
    ],
  );
  assert.deepEqual(
    inLanguage(entries, 'zh', LANGS).map((e) => e.articleId),
    ['202608101200'],
  );
});
