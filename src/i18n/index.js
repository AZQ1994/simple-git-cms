// 界面语言。字符串表在 ./zh.js / ./en.js / ./ja.js，键名是 '区域.名字' 的平铺形式。
//
// 取哪个语言：localStorage['simple-git-cms-lang'] → config.json 的 lang → 浏览器语言 → en。
// 在 Node 里（github.js 单独使用时）没有 localStorage / navigator，退回 en。
//
// 用法：
//   t('save.deleteConfirm', { title })         取一条字符串，{xxx} 会被 params 替换
//   applyI18n(root)                            按 data-i18n* 属性填好页面上的文字
import zh from './zh.js';
import en from './en.js';
import ja from './ja.js';

/** 支持的语言，顺序即语言菜单里的顺序 */
export const locales = { en, zh, ja };

const FALLBACK = 'en';
export const LANG_KEY = 'simple-git-cms-lang';

let current = FALLBACK;
let dict = locales[FALLBACK];

/** 'zh-CN' / 'ja-JP' → 'zh' / 'ja'；不支持的语言返回 null */
const normalize = (tag) => {
  const base = String(tag ?? '').toLowerCase().split(/[-_]/)[0];
  return base in locales ? base : null;
};

/**
 * 按优先级挑一个语言：使用者选过的 → config.json 的 lang → 浏览器语言 → en。
 * @param {object} [o]
 * @param {string} [o.configured] config.json 里的 lang
 * @returns {string} 语言代码
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

/** 切换语言（只改内存里的；是否记住由调用方决定） */
export function setLocale(code) {
  current = normalize(code) ?? FALLBACK;
  dict = locales[current];
  if (typeof document !== 'undefined') document.documentElement.lang = current;
  return current;
}

/** 记住使用者选的语言，下次打开还用它 */
export function rememberLocale(code) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(LANG_KEY, normalize(code) ?? FALLBACK);
}

export const getLocale = () => current;

/**
 * 取一条字符串。找不到键时返回键名本身（方便发现漏翻译），缺的翻译退回英文。
 * @param {string} key 如 'save.deleteConfirm'
 * @param {Record<string, string|number>} [params] 替换 {xxx}
 */
export function t(key, params) {
  const s = dict[key] ?? locales[FALLBACK][key] ?? key;
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s;
}

// 元素上可以写 data-i18n（填 textContent）或 data-i18n-<属性>（填该属性）
const ATTRS = ['placeholder', 'title', 'aria-label'];

/** 按 data-i18n* 属性填好页面上的文字。切换语言后再调一次即可。 */
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const attr of ATTRS) {
    const prop = `i18n${attr.replace(/(^|-)([a-z])/g, (m, _, c) => c.toUpperCase())}`;
    for (const el of root.querySelectorAll(`[data-i18n-${attr}]`)) el.setAttribute(attr, t(el.dataset[prop]));
  }
}
