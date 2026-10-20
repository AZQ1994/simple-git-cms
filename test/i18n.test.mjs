// 各语言的字符串表要一一对应：漏翻译、多余的键、占位符不一致都会在这里报出来。
import test from 'node:test';
import assert from 'node:assert/strict';
import { locales, t, setLocale, resolveLocale } from '../src/i18n/index.js';

const codes = Object.keys(locales);
const REFERENCE = 'en'; // 以英文为基准
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('有英文、简体中文、日文三种语言', () => {
  assert.deepEqual(codes.sort(), ['en', 'ja', 'zh']);
});

test('每种语言的键完全一致（没有漏翻译或多余的键）', () => {
  const expected = Object.keys(locales[REFERENCE]).sort();
  for (const code of codes) {
    assert.deepEqual(Object.keys(locales[code]).sort(), expected, `${code} 的键和 ${REFERENCE} 不一致`);
  }
});

test('同一个键在各语言里的占位符一致', () => {
  for (const [key, ref] of Object.entries(locales[REFERENCE])) {
    for (const code of codes) {
      assert.deepEqual(placeholders(locales[code][key]), placeholders(ref), `${code} 的 ${key} 占位符和 ${REFERENCE} 不一致`);
    }
  }
});

test('没有空字符串', () => {
  for (const code of codes) {
    for (const [key, value] of Object.entries(locales[code])) {
      assert.ok(typeof value === 'string' && value.trim(), `${code} 的 ${key} 是空的`);
    }
  }
});

test('t() 替换占位符；缺的键返回键名本身', () => {
  setLocale('zh');
  assert.equal(t('save.deleteConfirm', { title: '测试' }), '永久删除草稿「测试」？');
  setLocale('en');
  assert.equal(t('doc.descCount', { n: 42 }), '42 characters');
  assert.equal(t('nope.not.a.key'), 'nope.not.a.key');
  // 没传的占位符原样留着，不会变成 undefined
  assert.equal(t('doc.descCount'), '{n} characters');
});

test('不认识的语言退回英文', () => {
  assert.equal(setLocale('fr'), 'en');
  assert.equal(setLocale('zh-CN'), 'zh'); // 带地区的标签也认
  assert.equal(setLocale('ja-JP'), 'ja');
});

test('config.json 的 lang 决定语言；认不出来时用英文', () => {
  assert.equal(resolveLocale({ configured: 'ja' }), 'ja');
  assert.equal(resolveLocale({ configured: 'xx' }), 'en');
  assert.equal(resolveLocale(), 'en'); // Node 里没有 navigator / localStorage
});
