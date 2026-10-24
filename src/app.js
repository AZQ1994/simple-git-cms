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
//   release.js     the button that starts config.release's workflow, and how that run is doing
//   theme.js       light or dark
//   html-scan.js   whether the body's HTML closes everything it opens
//   config.js      what config.json may say, and what to say when it says something else
import { GitHubStore } from './github.js';
import { LocalStore } from './local.js';
import { loadArticles } from './articles.js';
import { setBlocks } from './blocks.js';
import { setImageOptions } from './images.js';
import { $, busy, fillIcons, toast } from './dom.js';
import { API_BASE, apiPinned, CONFIG, isLocal, on, setConfig, setStore, state, store } from './store.js';
import { relabel } from './lang.js';
import { refreshToken, showLogin, logout, takeTokenFromHash, TOKEN_KEY } from './auth.js';
import { renderList } from './list.js';
import { addBlockMenu, editor } from './editor.js';
import { restoreOpen, updateBar } from './doc.js';
import { showRelease } from './release.js';
import './preview-ui.js';
import './theme.js';
import { resolveLocale, setLocale, t } from './i18n/index.js';
import { ConfigError, checkConfig } from './config.js';

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
    collection: { label: t('config.defaultCollection'), url: '/{id}/', imageField: '', ...c.collection, dir: strip(c.collection?.dir) },
    media: { url: '/uploads', ...c.media, dir: strip(c.media?.dir) },
    deploy: { skipCiForDrafts: true, ...c.deploy },
    // No release button unless config.json asks for one
    release: c.release ? { ref: c.branch || 'main', ...c.release } : null,
  };
  config.media.url = '/' + strip(config.media.url);
  // On a different domain than the site, load images from the site's address — locally, from the
  // local site
  config.assetBase = isLocal || new URL(config.siteUrl).origin === location.origin ? '' : config.siteUrl;
  setConfig(config, c);
  setImageOptions({ ...config.media, timeZone: config.timeZone });
  setBlocks(config.blocks);
  addBlockMenu();

  for (const img of document.querySelectorAll('.brand-logo')) {
    img.src = config.logo;
    img.alt = config.siteName;
    img.addEventListener('error', () => (img.hidden = true)); // no logo is better than a broken one
  }
  relabel();
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
  const local = isLocal && !apiPinned ? await LocalStore.detect(CONFIG) : null;
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
        contentDir: CONFIG.collection.dir,
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
    showRelease();
    // The list fills in as it arrives and the editor opens on the first batch of it: with a few
    // hundred articles, waiting for the last one is waiting for all of them
    let announce;
    const first = new Promise((resolve) => (announce = resolve));
    const loading = loadArticles(store, {
      onBatch: (articles, left) => {
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
      state.pending = 0;
      renderList();
      toast(e.message || String(e), 'error');
    });

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
