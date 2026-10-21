// The languages have to line up exactly: a missing translation, a stray key, or a placeholder
// that doesn't match English all fail here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { locales, t, setLocale, resolveLocale } from '../src/i18n/index.js';

const codes = Object.keys(locales);
const REFERENCE = 'en'; // English is the yardstick
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('English, Simplified Chinese and Japanese are all present', () => {
  assert.deepEqual(codes.sort(), ['en', 'ja', 'zh']);
});

test('every language has exactly the same keys — nothing missing, nothing extra', () => {
  const expected = Object.keys(locales[REFERENCE]).sort();
  for (const code of codes) {
    assert.deepEqual(Object.keys(locales[code]).sort(), expected, `${code} does not have the same keys as ${REFERENCE}`);
  }
});

test('a key uses the same placeholders in every language', () => {
  for (const [key, ref] of Object.entries(locales[REFERENCE])) {
    for (const code of codes) {
      assert.deepEqual(placeholders(locales[code][key]), placeholders(ref), `placeholders in ${code}'s ${key} differ from ${REFERENCE}`);
    }
  }
});

test('no string is empty', () => {
  for (const code of codes) {
    for (const [key, value] of Object.entries(locales[code])) {
      assert.ok(typeof value === 'string' && value.trim(), `${code}'s ${key} is empty`);
    }
  }
});

test('t() fills placeholders, and an unknown key comes back as itself', () => {
  setLocale('zh');
  assert.equal(t('save.deleteConfirm', { title: '测试' }), '永久删除草稿「测试」？');
  setLocale('en');
  assert.equal(t('doc.descCount', { n: 42 }), '42 characters');
  assert.equal(t('nope.not.a.key'), 'nope.not.a.key');
  // A placeholder with nothing passed for it stays as written rather than becoming undefined
  assert.equal(t('doc.descCount'), '{n} characters');
});

test('an unknown language falls back to English', () => {
  assert.equal(setLocale('fr'), 'en');
  assert.equal(setLocale('zh-CN'), 'zh'); // tags carrying a region are understood too
  assert.equal(setLocale('ja-JP'), 'ja');
});

test("config.json's lang decides the language, and an unrecognised one means English", () => {
  assert.equal(resolveLocale({ configured: 'ja' }), 'ja');
  assert.equal(resolveLocale({ configured: 'xx' }), 'en');
  assert.equal(resolveLocale(), 'en'); // under Node there is no navigator or localStorage
});
