// The Simple Git CMS editor: a static page that reads and writes the repository's Markdown articles
// straight through the GitHub API. Everything site-specific lives in config.json next to this
// file (see public/config.example.json).
//
// This file only reads the configuration and starts things up. The interface is split across:
//   store.js       shared state and the event hub the modules below use to reach each other
//   dom.js         element lookup, icons, the toast and the busy overlay
//   lang.js        interface language and the language menus
//   auth.js        signing in and out, and refreshing the token
//   list.js        the sidebar list, its search and filters
//   editor.js      the editing surface: TipTap, the toolbar and the image tools
//   doc.js         the article form, saving, publishing, the status bar
//   preview-ui.js  the preview pane
import { GitHubStore } from './github.js';
import { setImageOptions } from './images.js';
import { $, busy, fillIcons } from './dom.js';
import { API_BASE, CONFIG, isLocal, on, setConfig, setStore, state, store } from './store.js';
import { relabel } from './lang.js';
import { refreshToken, showLogin, logout, takeTokenFromHash, TOKEN_KEY } from './auth.js';
import { renderList } from './list.js';
import { editor } from './editor.js';
import { restoreOpen, updateBar } from './doc.js';
import './preview-ui.js';
import { resolveLocale, setLocale, t } from './i18n/index.js';

fillIcons();

async function loadConfig() {
  const res = await fetch('./config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(t('config.missing'));
  const c = await res.json();
  // config.json's `lang` only applies when nobody has picked a language themselves
  setLocale(resolveLocale({ configured: c.lang }));
  const strip = (p) => String(p ?? '').replace(/^\/+|\/+$/g, '');
  const config = {
    title: t('config.defaultTitle'),
    siteName: '',
    logo: './logo.png',
    branch: 'main',
    timeZone: 'Asia/Tokyo',
    ...c,
    siteUrl: (c.siteUrl || location.origin).replace(/\/+$/, ''),
    auth: { ...c.auth },
    collection: { label: t('config.defaultCollection'), url: '/{id}/', ...c.collection, dir: strip(c.collection?.dir) },
    media: { url: '/uploads', ...c.media, dir: strip(c.media?.dir) },
    deploy: { skipCiForDrafts: true, ...c.deploy },
  };
  config.media.url = '/' + strip(config.media.url);
  if (!config.repo || !config.collection.dir || !config.media.dir || !config.auth.base) throw new Error(t('config.incomplete'));
  // On a different domain than the site, load images from the site's address — locally, from the
  // local site
  config.assetBase = isLocal || new URL(config.siteUrl).origin === location.origin ? '' : config.siteUrl;
  setConfig(config, c);
  setImageOptions({ ...config.media, timeZone: config.timeZone });

  for (const img of document.querySelectorAll('.brand-logo')) {
    img.src = config.logo;
    img.alt = config.siteName;
  }
  relabel();
}

async function start() {
  if (!CONFIG) {
    try {
      await loadConfig();
    } catch (e) {
      document.body.innerHTML = `<p style="padding:40px;font:15px sans-serif">${e.message}</p>`;
      return;
    }
  }
  const hashError = takeTokenFromHash();
  if (hashError) return showLogin(hashError);

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return showLogin();
  setStore(
    new GitHubStore({
      token,
      repo: CONFIG.repo,
      branch: CONFIG.branch,
      contentDir: CONFIG.collection.dir,
      apiBase: API_BASE,
      refresh: refreshToken,
      timeZone: CONFIG.timeZone,
    }),
  );

  await busy(t('save.loading'), async () => {
    const me = await store.whoami();
    if (!me.canWrite) return logout(t('login.noAccess', { login: me.login }));
    $('#user-name').textContent = me.name;
    $('#user-avatar').src = me.avatar;
    state.articles = await store.listArticles();
    $('#login').hidden = true;
    $('#app').hidden = false;
    renderList();
    updateBar();
    restoreOpen();
  });
}

// Signing in with a pasted token restarts the same flow
on('auth:signed-in', start);

start();
window.cmsEditor = editor; // handy when poking around from the browser console
