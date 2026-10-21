// The language menus, and refilling the interface after a switch.
import { $ } from './dom.js';
import { CONFIG, RAW, emit } from './store.js';
import { applyI18n, getLocale, locales, rememberLocale, resolveLocale, setLocale, t } from './i18n/index.js';

// Fill the page once from the remembered or browser language; loadConfig calls relabel() again
// once config.json is in, since it may carry a `lang`
setLocale(resolveLocale());
applyI18n();

/** Refill the interface after a language switch: fixed text, the language menus, and whatever is
 * already on screen. */
export function relabel() {
  applyI18n();
  // The empty-body placeholder is drawn by CSS, which reads it from this property
  document.documentElement.style.setProperty('--body-placeholder', JSON.stringify(t('doc.bodyPlaceholder')));
  for (const sel of document.querySelectorAll('.lang-select')) sel.value = getLocale();
  if (CONFIG) {
    CONFIG.title = RAW.title || t('config.defaultTitle');
    CONFIG.collection.label = RAW.collection?.label || t('config.defaultCollection');
    document.title = [CONFIG.title, CONFIG.siteName].filter(Boolean).join(' · ');
    document.querySelectorAll('[data-text="title"]').forEach((el) => (el.textContent = CONFIG.title));
    document.querySelectorAll('[data-text="collection"]').forEach((el) => (el.textContent = CONFIG.collection.label));
    $('#login-subtitle').textContent = t('login.subtitle', { collection: CONFIG.collection.label });
  }
  emit('relabel');
}

for (const sel of document.querySelectorAll('.lang-select')) {
  sel.replaceChildren(
    ...Object.entries(locales).map(([code, dict]) => {
      const o = document.createElement('option');
      o.value = code;
      o.textContent = dict['lang.name'];
      return o;
    }),
  );
  sel.value = getLocale();
  sel.addEventListener('change', (e) => {
    setLocale(e.target.value);
    rememberLocale(e.target.value);
    relabel();
  });
}
