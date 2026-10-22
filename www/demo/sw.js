// The demo's GitHub. This service worker answers every request the editor makes to
// api.github.com with something it made up, so the real editor — unmodified, the same bundle
// `npm run build` produces — can be driven by anyone, signed in to nothing.
//
// State lives in the Cache API rather than in a variable, because the browser is free to stop
// this worker between two requests and a variable wouldn't survive it. Nothing leaves the
// browser; "Reset" throws it all away.
const STATE_CACHE = 'simple-git-cms-demo-state';
const STATE_KEY = 'https://demo.invalid/state.json';
const CONTENT_DIR = 'site/content/news';
const MEDIA_DIR = 'site/public/uploads';

const utf8 = new TextEncoder();

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha1 = async (s) => hex(await crypto.subtle.digest('SHA-1', typeof s === 'string' ? utf8.encode(s) : s));

/** base64 of a string's UTF-8 bytes — what the contents API returns. */
const b64 = (s) => btoa(String.fromCharCode(...utf8.encode(s)));
const bytesOfB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const article = (title, date, tags, body, draft) =>
  `---\ntitle: ${JSON.stringify(title)}\ndescription: ""\ndate: ${date}\ntags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]\n${draft ? 'draft: true\n' : ''}---\n\n${body}\n`;

/** What a visitor finds when they arrive, and what Reset puts back. */
const seed = () => ({
  head: 'c0',
  files: {
    [`${CONTENT_DIR}/202610150930.md`]: {
      t: article('Spring term enrolment is open', '2026-10-15T09:30:00.000Z', ['notice', 'enrolment'],
        'Applications for the spring term are open from today.\n\nPlaces are limited, so apply early. The office is open on weekdays from 9:00 to 17:00.\n\n| Intake | Applications close | Term starts |\n| :----- | :----------------: | ----------: |\n| Spring |    20 February     |     1 April |\n| Summer |       20 May       |      1 July |\n\n## How to apply\n\nBring your identification and the completed form to the front desk, or send it by post.', false),
    },
    [`${CONTENT_DIR}/202610120800.md`]: {
      t: article('Autumn festival photos', '2026-10-12T08:00:00.000Z', ['events'],
        'Thank you to everyone who came along to this year’s autumn festival.\n\n![](/uploads/20261012/a1b2c3d4e5.webp "The opening ceremony")\n\nWe had the best turnout yet, and the weather held out all afternoon.', false),
    },
    [`${CONTENT_DIR}/202610010000.md`]: {
      t: article('Draft: timetable changes', '2026-10-01T00:00:00.000Z', ['notice'],
        'The timetable for next term is still being finalised.\n\n<aside class="notice">Rooms are not confirmed yet.</aside>', true),
    },
  },
  blobs: {},
  trees: {},
  commits: {},
  polls: {},
});

async function loadState() {
  const cache = await caches.open(STATE_CACHE);
  const hit = await cache.match(STATE_KEY);
  return hit ? hit.json() : seed();
}

async function saveState(state) {
  const cache = await caches.open(STATE_CACHE);
  await cache.put(STATE_KEY, new Response(JSON.stringify(state), { headers: { 'Content-Type': 'application/json' } }));
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// ---------- the GitHub API, as far as the editor is concerned ----------

async function api(request, url) {
  const p = url.pathname;
  const body = request.method === 'GET' ? null : await request.json().catch(() => null);
  const state = await loadState();

  if (p === '/user') {
    return json({
      login: 'demo-editor',
      name: 'Demo Editor',
      avatar_url:
        'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Ccircle cx=%2216%22 cy=%2216%22 r=%2216%22 fill=%22%231b2f6e%22/%3E%3Ctext x=%2216%22 y=%2221%22 font-family=%22sans-serif%22 font-size=%2213%22 fill=%22white%22 text-anchor=%22middle%22%3ED%3C/text%3E%3C/svg%3E',
    });
  }

  if (/^\/repos\/[^/]+\/[^/]+$/.test(p)) return json({ permissions: { push: true } });

  if (p === '/graphql') {
    const at = (expr) => expr.slice(expr.indexOf(':') + 1);
    // Which articles there are: names and hashes, the way the editor asks for the list
    if (body.query.includes('on Tree')) {
      const entries = [];
      for (const [path, file] of Object.entries(state.files)) {
        if (!path.startsWith(`${CONTENT_DIR}/`) || !('t' in file)) continue;
        entries.push({ name: path.split('/').pop(), oid: await sha1(file.t) });
      }
      return json({ data: { repository: { object: { entries } } } });
    }
    // And their text: one aliased field per article
    const repository = {};
    for (const [key, expr] of Object.entries(body.variables)) {
      if (!/^f\d+$/.test(key)) continue;
      const file = state.files[at(expr)];
      repository[key] = file && 't' in file ? { text: file.t } : null;
    }
    return json({ data: { repository } });
  }

  const contents = p.match(/\/contents\/(.+)$/);
  if (contents) {
    const file = state.files[decodeURIComponent(contents[1])];
    if (!file || !('t' in file)) return json({ message: 'Not Found' }, 404);
    return json({ sha: await sha1(file.t), content: b64(file.t) });
  }

  if (p.endsWith('/git/blobs') && request.method === 'POST') {
    const file = body.encoding === 'base64' ? { b: body.content } : { t: body.content };
    const sha = await sha1(body.encoding === 'base64' ? bytesOfB64(body.content) : body.content);
    state.blobs[sha] = file;
    await saveState(state);
    return json({ sha });
  }

  if (/\/git\/ref\/heads\//.test(p)) return json({ object: { sha: state.head } });
  if (/\/git\/commits\/[\w-]+$/.test(p)) return json({ tree: { sha: `tree-${state.head}` } });

  if (p.endsWith('/git/trees') && request.method === 'POST') {
    const next = { ...state.files };
    for (const entry of body.tree) {
      if (entry.sha === null) delete next[entry.path];
      else next[entry.path] = state.blobs[entry.sha];
    }
    const sha = `tree-${Object.keys(state.trees).length + 1}`;
    state.trees[sha] = next;
    await saveState(state);
    return json({ sha });
  }

  if (p.endsWith('/git/commits') && request.method === 'POST') {
    const sha = `commit-${body.tree}`;
    state.commits[sha] = { tree: body.tree, message: body.message };
    await saveState(state);
    return json({ sha, message: body.message });
  }

  if (/\/git\/refs\/heads\//.test(p) && request.method === 'PATCH') {
    const commit = state.commits[body.sha];
    if (!commit) return json({ message: 'Update is not a fast forward' }, 422);
    state.files = state.trees[commit.tree];
    state.head = body.sha;
    state.blobs = {};
    state.trees = {};
    await saveState(state);
    return json({ object: { sha: state.head } });
  }

  if (p.includes('/actions/runs')) {
    // Let the first poll come back as still running, so the bar in the editor has something to do
    const sha = url.searchParams.get('head_sha') ?? '';
    const seen = (state.polls[sha] ?? 0) + 1;
    state.polls[sha] = seen;
    await saveState(state);
    return json({ workflow_runs: [seen < 2 ? { status: 'in_progress' } : { status: 'completed', conclusion: 'success' }] });
  }

  return json({ message: `The demo doesn't answer ${request.method} ${p}` }, 501);
}

// ---------- the sign-in relay, as far as the editor is concerned ----------

function auth(url) {
  if (url.pathname.endsWith('/auth')) {
    const back = url.searchParams.get('redirect_uri') ?? './';
    return new Response(null, { status: 302, headers: { Location: `${back}#access_token=demo` } });
  }
  return json({ access_token: 'demo' }); // /refresh
}

// ---------- images ----------

async function upload(url) {
  const file = await loadState().then((s) => s.files[MEDIA_DIR + url.pathname.replace('/uploads', '')]);
  if (file?.b) return new Response(bytesOfB64(file.b), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' } });
  // The one image the demo starts with lives on the site rather than in the repository
  return fetch('/demo/sample.webp');
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('message', (e) => {
  if (e.data === 'reset') e.waitUntil(caches.delete(STATE_CACHE).then(() => e.source?.postMessage('reset-done')));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin === 'https://api.github.com') return e.respondWith(api(e.request, url));
  if (url.origin === self.location.origin && url.pathname.startsWith('/demo/auth')) return e.respondWith(auth(url));
  if (url.origin === self.location.origin && url.pathname.startsWith('/uploads/')) return e.respondWith(upload(url));
});
