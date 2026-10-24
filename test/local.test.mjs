// Editing the repository on this machine: the dev server's end of it (scripts/local-api.mjs) and
// the editor's end (src/local.js), driven against a real git repository in a temporary directory.
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localApi } from '../scripts/local-api.mjs';
import { LocalStore } from '../src/local.js';
import { ConflictError } from '../src/github.js';

const CONTENT = 'site/content/news';
const NOTICES = 'site/content/notices';
const MEDIA = 'site/public/uploads';

let root;
let server;
let store;

const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const article = (title, date) => `---\ntitle: "${title}"\ndescription: ""\ndate: ${date}\ntags: []\n---\n\n${title} の本文\n`;
const file = (id) => join(root, CONTENT, `${id}.md`);

// A repository of its own for every test, with the dev server's handler in front of it
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'sgcms-local-'));
  mkdirSync(join(root, CONTENT), { recursive: true });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'tester@example.invalid');
  git('config', 'user.name', 'Tester');
  writeFileSync(file('202601010000'), article('一', '2026-01-01T00:00:00.000Z'));
  writeFileSync(file('202602020000'), article('二', '2026-02-02T00:00:00.000Z'));
  git('add', '-A');
  git('commit', '-qm', 'seed');

  const handle = localApi({ root, contentDirs: [CONTENT, NOTICES], mediaDir: MEDIA, timeZone: 'UTC' });
  server = createServer(async (req, res) => {
    if (await handle(req, res)) return;
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  const { port } = server.address();
  store = new LocalStore({
    site: { name: 'Tester', root, branch: 'main', repo: true },
    contentDir: CONTENT,
    base: `http://127.0.0.1:${port}/__local`,
  });
});

afterEach(() => {
  server?.close();
  rmSync(root, { recursive: true, force: true });
});

test('the listing is what git itself would say the files hash to', async () => {
  const files = await store.listFiles();
  assert.deepEqual(files.map((f) => f.id), ['202602020000', '202601010000'], 'newest first');
  for (const f of files) assert.equal(f.oid, git('hash-object', `${CONTENT}/${f.id}.md`), 'git agrees about the hash');

  const texts = await store.readFiles(files.map((f) => f.id));
  assert.match(texts.get('202601010000'), /一 の本文/);
  assert.equal((await store.readFiles([])).size, 0);
});

test('saving writes the file and commits it, and leaves the rest of the index alone', async () => {
  // Someone has staged something else; this save must not carry it along
  writeFileSync(join(root, 'notes.txt'), 'mine\n');
  git('add', 'notes.txt');

  const files = await store.listFiles();
  const opened = files.find((f) => f.id === '202601010000');
  const r = await store.saveArticle(
    { id: '202601010000', title: '一、改めて', description: '', date: '2026-01-01T00:00:00.000Z', tags: [], draft: false, extra: {}, body: '新しい本文' },
    { baseSha: opened.oid, message: 'Update 一' },
  );

  assert.match(readFileSync(file('202601010000'), 'utf8'), /title: "一、改めて"/);
  assert.equal(r.sha, git('hash-object', `${CONTENT}/202601010000.md`));
  assert.equal(r.commit, git('rev-parse', 'HEAD'));
  assert.equal(git('log', '-1', '--format=%s'), 'Update 一');
  assert.deepEqual(git('show', '--name-only', '--format=', 'HEAD').split('\n'), [`${CONTENT}/202601010000.md`], 'that one file');
  assert.equal(git('diff', '--cached', '--name-only'), 'notes.txt', 'and what was staged is still staged');
});

test('a new article gets an id, and its images go in the same commit', async () => {
  const r = await store.saveArticle(
    { id: null, title: '新', description: '', date: '2026-03-01T00:00:00.000Z', tags: [], draft: true, extra: {}, body: '![](/uploads/x.webp)' },
    { images: [{ path: `${MEDIA}/x.webp`, bytes: new Uint8Array([1, 2, 3]) }], message: 'Create 新' },
  );

  assert.match(r.id, /^\d{12}$/);
  assert.ok(existsSync(file(r.id)));
  assert.deepEqual([...readFileSync(join(root, MEDIA, 'x.webp'))], [1, 2, 3], 'the bytes went in untouched');
  assert.deepEqual(git('show', '--name-only', '--format=', 'HEAD').split('\n').sort(), [`${CONTENT}/${r.id}.md`, `${MEDIA}/x.webp`]);
});

test('a file changed behind the editor is a conflict, and force wins', async () => {
  const [, first] = await store.listFiles();
  const mine = { id: first.id, title: '私の', description: '', date: '2026-01-01T00:00:00.000Z', tags: [], draft: false, extra: {}, body: 'mine' };
  writeFileSync(file(first.id), article('誰かの', '2026-01-01T00:00:00.000Z'));

  await assert.rejects(
    store.saveArticle(mine, { baseSha: first.oid, message: 'Update' }),
    (e) => e instanceof ConflictError && /誰かの/.test(e.theirs.title),
  );
  await store.saveArticle(mine, { baseSha: first.oid, force: true, message: 'Update' });
  assert.match(readFileSync(file(first.id), 'utf8'), /title: "私の"/);
});

test('deleting removes the file and commits that', async () => {
  const [newest] = await store.listFiles();
  await store.saveArticle({ id: newest.id, title: '二', description: '', date: '2026-02-02T00:00:00.000Z', tags: [], draft: false, extra: {}, body: '' }, {
    baseSha: newest.oid,
    deleteArticle: true,
    message: 'Delete 二',
  });
  assert.equal(existsSync(file(newest.id)), false);
  assert.equal(git('log', '-1', '--format=%s'), 'Delete 二');
  assert.deepEqual((await store.listFiles()).map((f) => f.id), ['202601010000']);
});

test('a repository in the middle of something is written to but not committed', async () => {
  writeFileSync(join(root, '.git', 'MERGE_HEAD'), `${git('rev-parse', 'HEAD')}\n`);
  const [, first] = await store.listFiles();
  const head = git('rev-parse', 'HEAD');

  const r = await store.saveArticle(
    { id: first.id, title: '途中', description: '', date: '2026-01-01T00:00:00.000Z', tags: [], draft: false, extra: {}, body: 'x' },
    { baseSha: first.oid, message: 'Update' },
  );
  assert.equal(r.commit, null);
  assert.equal(r.why, 'busy', 'and it says why, so the interface can');
  assert.match(readFileSync(file(first.id), 'utf8'), /title: "途中"/, 'the work is still safe on disk');
  assert.equal(git('rev-parse', 'HEAD'), head, 'nothing was committed into the merge');
});

test('an image path outside the configured directories is refused', async () => {
  await assert.rejects(
    store.saveArticle(
      { id: null, title: 'x', description: '', date: '2026-03-01T00:00:00.000Z', tags: [], draft: true, extra: {}, body: '' },
      { images: [{ path: '../../etc/passwd', bytes: new Uint8Array([1]) }], message: 'x' },
    ),
    /outside the configured directories/,
  );
});

test('the history is git log for that one file, and each version is the file at its commit', async () => {
  const id = '202601010000';
  const save = async (title, message) => {
    const [opened] = (await store.listFiles()).filter((f) => f.id === id);
    await store.saveArticle({ id, title, description: '', date: '2026-01-01T00:00:00.000Z', tags: [], draft: false, extra: {}, body: `${title} の本文` }, { baseSha: opened.oid, message });
  };
  await save('一・二回目', '[skip ci] 二回目');
  await save('一・三回目', '三回目');
  // Something else changed meanwhile, which isn't this article's history
  writeFileSync(file('202602020000'), article('二・改', '2026-02-02T00:00:00.000Z'));
  git('commit', '-qam', 'other');

  const history = await store.history(id);
  assert.deepEqual(history.map((c) => c.message), ['三回目', '二回目', 'seed'], 'newest first, this file only, without [skip ci]');
  assert.equal(history[0].author, 'Tester');
  assert.ok(!Number.isNaN(Date.parse(history[0].date)));

  assert.equal((await store.getArticle(id, history[1].sha)).title, '一・二回目');
  assert.equal((await store.getArticle(id, history[2].sha)).title, '一');
  assert.equal(await store.getArticle('202603030000', history[0].sha), null, 'not there at that commit');
  await assert.rejects(store.getArticle(id, 'HEAD; rm -rf'), 'only a commit hash is taken as a ref');
  await assert.rejects(store.history('../../etc'), 'and only an article id as an id');
});

test('each collection is its own directory, and the server answers for no other', async () => {
  mkdirSync(join(root, NOTICES), { recursive: true });
  writeFileSync(join(root, NOTICES, '202603030000.md'), article('お知らせ', '2026-03-03T00:00:00.000Z'));

  store.contentDir = NOTICES; // what switching in the sidebar does
  assert.deepEqual((await store.listFiles()).map((f) => f.id), ['202603030000']);
  const r = await store.saveArticle(
    { id: null, title: '新しいお知らせ', description: '', date: '2026-03-04T00:00:00.000Z', tags: [], draft: true, extra: {}, body: '' },
    { message: 'Create' },
  );
  assert.ok(existsSync(join(root, NOTICES, `${r.id}.md`)), 'a new article goes in the collection it was written in');
  assert.equal(existsSync(file(r.id)), false);

  store.contentDir = 'site/content';
  await assert.rejects(store.listFiles(), /not a collection directory/);
  store.contentDir = '../..';
  await assert.rejects(store.listFiles(), /not a collection directory/);
});
