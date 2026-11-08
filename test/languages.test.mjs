// Articles in several languages: which file is which language. Plain functions, so every case is a
// line or two.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileName, fileId, inLanguage, languagesOf, splitName, translatedFrom, translationOf, translationState, translationsOf, wordsOf } from '../integrations/languages.js';

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

test('a translation knows what it was translated from, and whether that has changed', () => {
  const versions = { ja: { sha: 'b' } };
  const zh = (translatedFrom) => ({ extra: { translatedFrom } });
  assert.deepEqual(translatedFrom(zh({ lang: 'ja', sha: 'a' })), { lang: 'ja', sha: 'a', words: null });
  assert.equal(translationState(zh({ lang: 'ja', sha: 'b' }), versions), 'current');
  assert.equal(translationState(zh({ lang: 'ja', sha: 'a' }), versions), 'outdated');
  assert.equal(translationState(zh({ lang: 'en', sha: 'a' }), versions), 'orphan');
  assert.equal(translationState({ extra: {} }, versions), 'original');
  assert.equal(translationState(zh('ja'), versions), 'original', 'a value that isn’t one is ignored');
});

test('a source saved with the same words leaves its translation current', () => {
  const ja = { sha: 'a', title: '休館', description: '', tags: ['お知らせ'], body: '月曜は休館です。\n', draft: true, date: '2026-11-01T00:00:00.000Z' };
  const zh = { extra: { translatedFrom: translationOf('ja', ja) } };
  assert.equal(translationState(zh, { ja }), 'current');
  const published = { ...ja, sha: 'b', draft: false, date: '2026-11-02T00:00:00.000Z', extra: { image: '/u/x.webp' } };
  assert.equal(translationState(zh, { ja: published }), 'current', 'published, a new date, a cover: nothing to translate');
  assert.equal(translationState(zh, { ja: { ...published, body: '月曜と火曜は休館です。\n' } }), 'outdated');
  assert.equal(translationState(zh, { ja: { ...published, tags: ['お知らせ', '休館'] } }), 'outdated', 'tags are words too');
  assert.equal(wordsOf(ja), '休館\n\nお知らせ\n\n月曜は休館です。', 'title, summary, tags, then the body');
});
