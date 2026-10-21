// Shared state, plus the small event hub the editor's modules use to talk to each other without
// importing one another in circles. Everything here is plain data and has no dependencies on the
// DOM, so it sits at the bottom of the import graph.
import { getLocale } from './i18n/index.js';

export const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
// While developing locally, the GitHub API can be pointed at a proxy on this machine
export const API_BASE = (isLocal && localStorage.getItem('simple-git-cms-api')) || 'https://api.github.com';

/** config.json, filled in with defaults. Set once at startup by loadConfig(). */
export let CONFIG;
/** config.json exactly as written, so a language switch can tell a configured value from a default. */
export let RAW = {};

export function setConfig(config, raw) {
  CONFIG = config;
  RAW = raw;
}

/** The GitHubStore, once someone is signed in. */
export let store;
export const setStore = (s) => (store = s);

export const state = {
  articles: [],
  filter: 'all',
  current: null, // the article being edited, as last saved or loaded
  dirty: false,
  loading: false,
};

/** New images not committed yet: path on the site -> { blob, url, uploaded } */
export const pending = new Map();

/** Hold a new image until something commits it, and give back the path it will have on the site. */
export function addPending(path, blob) {
  pending.set(path, { blob, url: URL.createObjectURL(blob), uploaded: false });
  return path;
}

// When the editor is on a different domain than the site, images need the site's address prefixed
export const displaySrc = (src) => pending.get(src)?.url ?? (src?.startsWith('/') && CONFIG.assetBase ? CONFIG.assetBase + src : src);
// An image's path on the site (/uploads/…) to its path in the repository (public/uploads/…)
export const mediaRepoPath = (url) => CONFIG.media.dir + url.slice(CONFIG.media.url.length);

// The date input needs ISO YYYY-MM-DD; the list shows it in the interface language
export const fmtDateInput = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: CONFIG.timeZone });
export const fmtDate = (iso) => new Date(iso).toLocaleDateString(getLocale(), { timeZone: CONFIG.timeZone, dateStyle: 'medium' });
// For things that happened rather than things that are dated — "kept since 21 Oct, 17:41"
export const fmtDateTime = (ms) => new Date(ms).toLocaleString(getLocale(), { timeZone: CONFIG.timeZone, dateStyle: 'medium', timeStyle: 'short' });

// ---------- Events ----------
//
// Used only where a module would otherwise have to import one that already imports it:
//   auth:expired   a request came back 401 and could not be refreshed
//   auth:signed-in a token was just stored, so startup should run again
//   article:open   the list was clicked
//   doc:changed    the article being edited was modified
//   relabel        the interface language changed

const handlers = new Map();

/** Listen for an event. Returns nothing; listeners live for the life of the page. */
export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, []);
  handlers.get(name).push(fn);
}

export function emit(name, payload) {
  for (const fn of handlers.get(name) ?? []) fn(payload);
}
