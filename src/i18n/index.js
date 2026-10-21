// Interface languages. The strings themselves live in ./en.js, ./zh.js and ./ja.js as one flat
// object each, keyed '<area>.<name>'.
//
// Which language: localStorage['simple-git-cms-lang'] -> config.json's `lang` -> the browser -> English.
// Under Node — when github.js is used on its own — there is no localStorage or navigator, so it
// falls back to English.
//
// Usage:
//   t('save.deleteConfirm', { title })   one string, with {xxx} replaced from params
//   applyI18n(root)                      fill in the page from its data-i18n* attributes
import zh from './zh.js';
import en from './en.js';
import ja from './ja.js';

/** The languages on offer; this order is the order of the language menu. */
export const locales = { en, zh, ja };

const FALLBACK = 'en';
export const LANG_KEY = 'simple-git-cms-lang';

let current = FALLBACK;
let dict = locales[FALLBACK];

/** 'zh-CN' / 'ja-JP' to 'zh' / 'ja'; null for a language we don't have. */
const normalize = (tag) => {
  const base = String(tag ?? '').toLowerCase().split(/[-_]/)[0];
  return base in locales ? base : null;
};

/**
 * Pick a language, in order of preference: one the person chose before, then config.json's `lang`,
 * then the browser's, then English.
 * @param {object} [o]
 * @param {string} [o.configured] The `lang` from config.json.
 * @returns {string} Language code.
 */
export function resolveLocale({ configured } = {}) {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(LANG_KEY) : null;
  const preferred = typeof navigator !== 'undefined' ? [navigator.language, ...(navigator.languages ?? [])] : [];
  for (const tag of [stored, configured, ...preferred]) {
    const code = normalize(tag);
    if (code) return code;
  }
  return FALLBACK;
}

/** Switch language in memory. Whether to remember it is the caller's decision. */
export function setLocale(code) {
  current = normalize(code) ?? FALLBACK;
  dict = locales[current];
  if (typeof document !== 'undefined') document.documentElement.lang = current;
  return current;
}

/** Remember the language someone picked, so it is used again next time. */
export function rememberLocale(code) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(LANG_KEY, normalize(code) ?? FALLBACK);
}

export const getLocale = () => current;

/**
 * One string. An unknown key comes back as the key itself, which makes a gap easy to spot; a key
 * missing from this language falls back to English.
 * @param {string} key For example 'save.deleteConfirm'.
 * @param {Record<string, string|number>} [params] Values for the {xxx} placeholders.
 */
export function t(key, params) {
  const s = dict[key] ?? locales[FALLBACK][key] ?? key;
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s;
}

// An element carries either data-i18n (fills textContent) or data-i18n-<attribute>
const ATTRS = ['placeholder', 'title', 'aria-label'];

/** Fill in the page from its data-i18n* attributes. Call it again after switching language. */
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const attr of ATTRS) {
    const prop = `i18n${attr.replace(/(^|-)([a-z])/g, (m, _, c) => c.toUpperCase())}`;
    for (const el of root.querySelectorAll(`[data-i18n-${attr}]`)) el.setAttribute(attr, t(el.dataset[prop]));
  }
}
