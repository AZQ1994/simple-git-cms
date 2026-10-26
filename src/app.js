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
//   articles.js    loading that list: which files there are, then their text, in batches
//   local.js       the same store, backed by the files on this machine while developing
//   editor.js      the editing surface: TipTap, the toolbar and the image tools
//   doc.js         the article form, saving, publishing, the status bar
//   preview-ui.js  the preview pane
//   actions.js     the buttons that start config.actions' workflows, and how each run is doing
//   theme.js       light or dark
//   html-scan.js   whether the body's HTML closes everything it opens
//   config.js      what config.json may say, and what to say when it says something else
import { GitHubStore } from './github.js';
import { LocalStore } from './local.js';
import { loadArticles } from './articles.js';
import { setBlocks } from './blocks.js';
import { setImageOptions } from './images.js';
import { $, busy, fillIcons, toast } from './dom.js';
import { API_BASE, apiPinned, COLLECTION, CONFIG, isLocal, on, setCollection, setConfig, setStore, state, store } from './store.js';
import { relabel } from './lang.js';
import { refreshToken, showLogin, logout, takeTokenFromHash, TOKEN_KEY } from './auth.js';
import { renderList } from './list.js';
import { addBlockMenu, editor } from './editor.js';
import { collectionInUrl, confirmDiscard, restoreOpen, showNothing, updateBar } from './doc.js';
import { showActions } from './actions.js';
import './preview-ui.js';
import './history.js';
import './theme.js';
import { resolveLocale, setLocale, t } from './i18n/index.js';
import { ConfigError, checkConfig, collectionName } from './config.js';

fillIcons();

async function loadConfig() {
  const res = await fetch('./config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(t('config.missing'));
  let c;
  try {
    c = await res.json();
  } catch (e) {
    throw new Error(t('config.badJson', { message: e.message }), { cause: e });
  }
  // config.json's `lang` only applies when nobody has picked a language themselves
  setLocale(resolveLocale({ configured: c?.lang }));

  // Say everything that is wrong with it at once, rather than one thing per reload
  const { problems, warnings } = checkConfig(c, t);
  for (const w of warnings) console.warn(`config.json: ${w.text}`);
  if (problems.length) throw new ConfigError(problems);
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
    // Each one's label is filled in by relabel(), since the default depends on the language
    collections: c.collections.map((col) => ({
      url: '/{id}/',
      imageField: '',
      preview: '',
      ...col,
      name: collectionName(col),
      dir: strip(col.dir),
    })),
    media: { url: '/uploads', ...c.media, dir: strip(c.media?.dir) },
    deploy: { skipCiForDrafts: true, ...c.deploy },
    // Buttons that start a workflow; none unless config.json lists some
    actions: (c.actions ?? []).map((a) => ({ ref: c.branch || 'main', inputs: {}, ...a })),
  };
  config.media.url = '/' + strip(config.media.url);
  // On a different domain than the site, load images from the site's address — locally, from the
  // local site
  config.assetBase = isLocal || new URL(config.siteUrl).origin === location.origin ? '' : config.siteUrl;
  setConfig(config, c);
  // The one in the address bar, when it names one; the first one otherwise
  setCollection(config.collections.find((col) => col.name === collectionInUrl()) ?? config.collections[0]);
  setImageOptions({ ...config.media, timeZone: config.timeZone });
  setBlocks(config.blocks);
  addBlockMenu();

  for (const img of document.querySelectorAll('.brand-logo')) {
    img.src = config.logo;
    img.alt = config.siteName;
    img.addEventListener('error', () => (img.hidden = true)); // no logo is better than a broken one
  }
  relabel(); // which also fills the collections menu
}

/** The sidebar's menu of collections, when there is more than one to choose from. */
function fillCollections() {
  const select = $('#collection-select');
  select.hidden = CONFIG.collections.length < 2;
  $('#collection-label').hidden = !select.hidden;
  select.replaceChildren(
    ...CONFIG.collections.map((col) => {
      const o = document.createElement('option');
      o.value = col.name;
      o.textContent = col.label;
      return o;
    }),
  );
  select.value = COLLECTION.name;
}
on('relabel', () => CONFIG && fillCollections());

$('#collection-select').addEventListener('change', async (e) => {
  const next = CONFIG.collections.find((col) => col.name === e.target.value);
  if (!next || next === COLLECTION) return;
  if (!confirmDiscard()) {
    e.target.value = COLLECTION.name;
    return;
  }
  setCollection(next);
  // A list still loading from the last one stops at its next request (see loadList), so the
  // store can simply be pointed at the other directory
  store.contentDir = next.dir;
  showNothing(); // closes what was open, and the address bar now says which collection
  state.articles = [];
  state.pending = 0;
  renderList();
  relabel();
  await busy(t('save.loading'), loadList);
});

let listing = 0; // which load of the list is the latest; an older one still arriving is ignored

/** Read the open collection's articles into the sidebar, and reopen what the address bar says. */
async function loadList() {
  const mine = ++listing;
  // The list fills in as it arrives and the editor opens on the first batch of it: with a few
  // hundred articles, waiting for the last one is waiting for all of them
  let announce;
  const first = new Promise((resolve) => (announce = resolve));
  const loading = loadArticles(store, {
    stop: () => mine !== listing, // the sidebar has switched to another collection since
    onBatch: (articles, left) => {
      if (mine !== listing) return;
      state.articles = articles;
      state.pending = left;
      // There is something to show, or there is nothing at all to show — either way, stop waiting
      if (articles.length || !left) announce();
      if (!$('#app').hidden) renderList();
    },
  });
  // Whichever comes first: something to show, or the whole thing failing before there is any
  await Promise.race([first, loading]);
  loading.catch((e) => {
    if (mine !== listing) return;
    state.pending = 0;
    renderList();
    toast(e.message || String(e), 'error');
  });
  if (mine !== listing) return;
  $('#login').hidden = true;
  $('#app').hidden = false;
  renderList();
  updateBar();
  restoreOpen();
}

/** config.json is the one thing the editor can't recover from, so the page becomes the message. */
function showStartupError(error) {
  const box = document.createElement('div');
  box.className = 'fatal';
  const heading = document.createElement('h1');
  heading.textContent = error instanceof ConfigError ? t('config.heading') : error.message;
  box.append(heading);
  if (error instanceof ConfigError) {
    const list = document.createElement('ul');
    for (const problem of error.problems) {
      const item = document.createElement('li');
      item.textContent = problem.text;
      list.append(item);
    }
    const where = document.createElement('p');
    where.textContent = t('config.where');
    box.append(list, where);
  }
  document.body.replaceChildren(box);
}

async function start() {
  if (!CONFIG) {
    try {
      await loadConfig();
    } catch (e) {
      showStartupError(e);
      return;
    }
  }
  // `npm run dev` puts the repository on this machine behind the editor. Nothing else answers
  // this, and nothing but localhost is asked, so anywhere else the editor signs in to GitHub.
  const local = isLocal && !apiPinned ? await LocalStore.detect(COLLECTION.dir) : null;
  if (local) {
    setStore(local);
  } else {
    const hashError = takeTokenFromHash();
    if (hashError) return showLogin(hashError);

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return showLogin();
    setStore(
      new GitHubStore({
        token,
        repo: CONFIG.repo,
        branch: CONFIG.branch,
        contentDir: COLLECTION.dir,
        apiBase: API_BASE,
        refresh: refreshToken,
        timeZone: CONFIG.timeZone,
      }),
    );
  }

  await busy(t('save.loading'), async () => {
    const me = await store.whoami();
    if (!me.canWrite) return logout(t('login.noAccess', { login: me.login }));
    $('#user-name').textContent = me.name;
    $('#user-name').title = me.name; // the corner is narrow, and a long name is cut short
    $('#user-avatar').src = me.avatar;
    // Saying so, because "this is my own computer" and "this is the live site" look the same
    $('#local-badge').hidden = !store.local;
    $('#local-badge').title = store.local ? `${store.site.root}${store.site.branch ? ` · ${store.site.branch}` : ''}` : '';
    $('#user-avatar').hidden = Boolean(store.local); // a picture of nobody, and the badge needs the room
    $('#logout').hidden = Boolean(store.local); // there is nothing to sign out of
    showActions();
    await loadList();
  });
}

// Signing in with a pasted token restarts the same flow
on('auth:signed-in', start);

start();
window.cmsEditor = editor; // handy when poking around from the browser console
