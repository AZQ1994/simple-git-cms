// Saving, tested against an in-memory fake of the GitHub API — nothing touches the network.
// The fixtures are deliberately CJK: article files are UTF-8 and the base64 and YAML paths both
// have to carry non-ASCII text through unchanged.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { GitHubStore, ConflictError, AuthError } from '../src/github.js';

let files; // path -> text
let head;
let commits;
let raceOnce; // makes the next branch update behave as if someone else committed first
let queries; // every GraphQL query sent, to show what the listing does and doesn't ask for
const blobs = new Map();
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');

function fakeFetch(url, { method = 'GET', body } = {}) {
  const u = new URL(url);
  const p = u.pathname;
  const json = body ? JSON.parse(body) : null;
  const ok = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }));
  let m;
  if (p === '/user') return ok({ login: 'tester' });
  if (p === '/graphql') {
    queries.push(json.query);
    const path = (expr) => expr.slice(expr.indexOf(':') + 1);
    // The listing: one entry per file in the directory
    if (json.query.includes('on Tree')) {
      const dir = path(json.variables.expr) + '/';
      const entries = [...files]
        .filter(([f]) => f.startsWith(dir))
        .map(([f, text]) => ({ name: f.slice(dir.length), oid: sha(text) }));
      return ok({ data: { repository: { object: { entries } } } });
    }
    // The bodies: one aliased field per article asked for
    const repository = {};
    for (const [k, expr] of Object.entries(json.variables)) {
      if (!/^f\d+$/.test(k)) continue;
      const text = files.get(path(expr));
      repository[k] = text === undefined ? null : { text };
    }
    return ok({ data: { repository } });
  }
  if ((m = p.match(/\/contents\/(.+)$/))) {
    const f = files.get(decodeURIComponent(m[1]));
    return f === undefined ? ok({ message: 'Not Found' }, 404) : ok({ sha: sha(f), content: Buffer.from(f).toString('base64') });
  }
  if (p.endsWith('/git/blobs')) {
    const text = json.encoding === 'base64' ? Buffer.from(json.content, 'base64').toString('latin1') : json.content;
    const s = json.encoding === 'base64' ? sha('bin' + text) : sha(text);
    blobs.set(s, text);
    return ok({ sha: s });
  }
  if (p.endsWith('/git/ref/heads/main')) return ok({ object: { sha: head } });
  if (p.match(/\/git\/commits\/[\w-]+$/)) return ok({ tree: { sha: 'tree-' + head } });
  if (p.endsWith('/git/trees')) {
    const next = new Map(files);
    for (const e of json.tree) e.sha === null ? next.delete(e.path) : next.set(e.path, blobs.get(e.sha));
    const t = 'tree' + commits.length;
    commits.push({ tree: t, files: next });
    return ok({ sha: t });
  }
  if (p.endsWith('/git/commits') && method === 'POST') return ok({ sha: 'c-' + json.tree, message: json.message });
  if (p.endsWith('/git/refs/heads/main') && method === 'PATCH') {
    if (raceOnce) {
      raceOnce();
      raceOnce = null;
      return ok({ message: 'Update is not a fast forward' }, 422);
    }
    const c = commits.find((x) => 'c-' + x.tree === json.sha);
    files = c.files;
    head = json.sha;
    return ok({ object: { sha: head } });
  }
  return ok({ message: `unhandled ${method} ${p}` }, 500);
}

beforeEach(() => {
  files = new Map([['site/news/1.md', '---\ntitle: "一"\ndate: 2026-01-01T00:00:00.000Z\ntags: ["a"]\n---\n\n正文\n']]);
  head = 'c0';
  commits = [];
  raceOnce = null;
  queries = [];
  globalThis.fetch = fakeFetch;
});

const store = () => new GitHubStore({ token: 't', repo: 'o/r', contentDir: 'site/news/' });

test('the listing is names and hashes, with no bodies in it; the text is a separate request', async () => {
  files.set('site/news/2.md', '---\ntitle: "二"\ndate: 2026-02-01T00:00:00.000Z\n---\n\n二\n');
  files.set('site/news/notes.txt', 'not an article');
  const s = store();

  const list = await s.listFiles();
  assert.deepEqual(
    list.map((f) => f.id),
    ['2', '1'],
    'newest first, by the id in the file name, and nothing that is not an article',
  );
  assert.ok(list.every((f) => f.oid));
  assert.equal(queries.length, 1);
  assert.doesNotMatch(queries[0], /text/, 'the listing must not carry the articles themselves');

  const texts = await s.readFiles(['1', '2']);
  assert.equal(queries.length, 2, 'both articles in one request');
  assert.match(texts.get('1'), /正文/);
  assert.match(texts.get('2'), /二/);
});

test('reading a file that is no longer there leaves it out, and reading nothing asks nothing', async () => {
  const s = store();
  const texts = await s.readFiles(['1', 'gone']);
  assert.deepEqual([...texts.keys()], ['1']);
  assert.equal((await s.readFiles([])).size, 0);
  assert.equal(queries.length, 1, 'an empty batch is not a request');
});

test('a new article: the article and its images land in one commit', async () => {
  const s = store();
  const r = await s.saveArticle(
    { id: null, title: '新', description: '', date: '2026-02-01T00:00:00Z', tags: ['a'], draft: true, extra: {}, body: '![](/u/x.webp)' },
    { images: [{ path: 'site/public/u/x.webp', bytes: new Uint8Array([1, 2, 3]) }], message: 'm' },
  );
  assert.match(r.id, /^\d{12}$/);
  assert.ok(files.has(`site/news/${r.id}.md`));
  assert.ok(files.has('site/public/u/x.webp'));
  assert.equal(commits.length, 1);
  assert.equal(r.text, files.get(`site/news/${r.id}.md`), 'and it hands back what it wrote, which is what the article now is');
});

test('changed by someone else after opening gives ConflictError, and force overwrites', async () => {
  const s = store();
  const a = await s.getArticle('1');
  files.set('site/news/1.md', files.get('site/news/1.md').replace('正文', '别人改的'));
  await assert.rejects(s.saveArticle({ ...a, title: '我的' }, { baseSha: a.sha }), (e) => e instanceof ConflictError && e.theirs.body.includes('别人改的'));
  await s.saveArticle({ ...a, title: '我的' }, { baseSha: a.sha, force: true });
  assert.match(files.get('site/news/1.md'), /title: "我的"/);
});

test('the branch moving under a save (a different file) retries from the new tip', async () => {
  const s = store();
  const a = await s.getArticle('1');
  raceOnce = () => {
    files.set('site/news/2.md', 'other');
    head = 'c-other';
  };
  await s.saveArticle({ ...a, title: '改' }, { baseSha: a.sha });
  assert.match(files.get('site/news/1.md'), /title: "改"/);
  assert.equal(files.get('site/news/2.md'), 'other');
});

test('deleting an article', async () => {
  const s = store();
  const a = await s.getArticle('1');
  await s.saveArticle(a, { baseSha: a.sha, deleteArticle: true });
  assert.equal(files.has('site/news/1.md'), false);
});

test('an expired token (401) is refreshed and the request retried once; otherwise it reports the session as expired', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, opts) =>
    opts?.headers?.Authorization === 'Bearer old'
      ? Promise.resolve(new Response('{"message":"Bad credentials"}', { status: 401 }))
      : realFetch(url, opts);
  let calls = 0;
  const store = new GitHubStore({
    token: 'old', repo: 'o/r', contentDir: 'site/news',
    refresh: async () => (calls++, 'new'),
  });
  assert.equal((await store.req('/user')).login, 'tester');
  assert.equal(store.token, 'new');
  assert.equal(calls, 1);

  const dead = new GitHubStore({ token: 'old', repo: 'o/r', contentDir: 'site/news', refresh: async () => null });
  await assert.rejects(dead.req('/user'), (e) => e instanceof AuthError);
});

test('release starts the workflow on the branch and follows the run GitHub names', async () => {
  const asked = [];
  globalThis.fetch = (url, { method = 'GET', body } = {}) => {
    const p = new URL(url).pathname;
    asked.push(`${method} ${p}`);
    const ok = (data) => Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
    if (p.endsWith('/actions/workflows/release.yml/dispatches')) {
      assert.deepEqual(JSON.parse(body), { ref: 'main', return_run_details: true });
      return ok({ workflow_run_id: 42, run_url: 'x', html_url: 'y' });
    }
    if (p.endsWith('/actions/runs/42')) return ok({ status: 'completed', conclusion: 'success' });
    return ok({});
  };
  const s = store();
  const runId = await s.release({ workflow: 'release.yml', ref: 'main' });
  assert.equal(runId, 42);
  assert.equal(await s.releaseStatus({ workflow: 'release.yml', ref: 'main', runId, since: Date.now() }), 'success');
  assert.deepEqual(asked, ['POST /repos/o/r/actions/workflows/release.yml/dispatches', 'GET /repos/o/r/actions/runs/42']);
});

test('without a run id, the release is the newest dispatched run since it was started', async () => {
  const since = Date.parse('2026-10-24T10:00:00Z');
  let runs = [];
  globalThis.fetch = (url, { method = 'GET' } = {}) => {
    const u = new URL(url);
    if (method === 'POST') return Promise.resolve(new Response(null, { status: 204 })); // the old answer
    assert.equal(u.pathname, '/repos/o/r/actions/workflows/release.yml/runs');
    assert.equal(u.searchParams.get('event'), 'workflow_dispatch');
    assert.equal(u.searchParams.get('branch'), 'main');
    return Promise.resolve(new Response(JSON.stringify({ workflow_runs: runs }), { status: 200 }));
  };
  const s = store();
  assert.equal(await s.release({ workflow: 'release.yml', ref: 'main' }), null);
  const status = () => s.releaseStatus({ workflow: 'release.yml', ref: 'main', runId: null, since });
  runs = [{ created_at: '2026-10-23T09:00:00Z', status: 'completed', conclusion: 'success' }];
  assert.equal(await status(), 'pending', 'yesterday’s release is not this one');
  runs = [{ created_at: '2026-10-24T10:00:03Z', status: 'in_progress', conclusion: null }, ...runs];
  assert.equal(await status(), 'pending');
  runs[0] = { ...runs[0], status: 'completed', conclusion: 'failure' };
  assert.equal(await status(), 'failure');
});
