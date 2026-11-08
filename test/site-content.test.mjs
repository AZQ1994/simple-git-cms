// Writing a site's articles from this machine, the way the MCP server does — against a real git
// repository in a temporary directory, since translations are tracked by git's own hashes.
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContentError, blobSha, openSite } from '../scripts/site-content.mjs';

let root;
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const read = (p) => readFileSync(join(root, p), 'utf8');

function makeSite(config) {
  root = mkdtempSync(join(tmpdir(), 'sgcms-content-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'tester@example.invalid');
  git('config', 'user.name', 'Tester');
  mkdirSync(join(root, 'public/editor'), { recursive: true });
  mkdirSync(join(root, 'src/content/news'), { recursive: true });
  writeFileSync(join(root, 'public/editor/config.json'), JSON.stringify({ repo: 'o/r', auth: { base: '/a' }, media: { dir: 'public/uploads', url: '/uploads' }, timeZone: 'Asia/Tokyo', ...config }));
  writeFileSync(join(root, 'README.md'), 'site\n');
  git('add', '-A');
  git('commit', '-qm', 'seed');
  return openSite({ configPath: join(root, 'public/editor/config.json') });
}

const bilingual = () => makeSite({ languages: ['ja', 'zh'], collections: [{ name: 'news', dir: 'src/content/news', imageField: 'image' }] });

beforeEach(() => {
  root = null;
});
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

test('a new article is a draft in the default language, in a file without a suffix', () => {
  const site = bilingual();
  const a = site.write({ title: '夏期講習', body: '# 夏期講習\n\n本文です。', date: '2026-08-10T03:00:00Z' });
  assert.match(a.id, /^\d{12}$/);
  assert.equal(a.lang, 'ja');
  assert.equal(a.draft, true);
  assert.equal(a.state, 'original');
  assert.deepEqual(a.written, [`src/content/news/${a.id}.md`]);
  assert.match(read(`src/content/news/${a.id}.md`), /^---\ntitle: "夏期講習"\n/);
});

test('a translation records its source, and goes out of date when the source’s words change', () => {
  const site = bilingual();
  const { id } = site.write({ title: '夏期講習', body: '一行目\n\n二行目', date: '2026-08-10T03:00:00Z', fields: { image: '/uploads/a.webp' } });
  const zh = site.write({ id, lang: 'zh', title: '暑期讲习', body: '第一行\n\n第二行', from: 'ja' });
  assert.equal(zh.state, 'current');
  assert.equal(zh.translatedFrom.sha, blobSha(read(`src/content/news/${id}.md`)));
  // A new language starts from what the others share
  assert.equal(zh.date, '2026-08-10T03:00:00.000Z');
  assert.equal(zh.fields.image, '/uploads/a.webp');

  site.write({ id, body: '一行目\n\n二行目を書き直した' });
  assert.equal(site.get({ id, lang: 'zh' }).state, 'outdated');
  assert.deepEqual(
    site.list({ status: 'outdated' }).articles.map((a) => a.id),
    [id],
  );

  const changes = site.sourceChanges({ id, lang: 'zh' });
  assert.equal(changes.state, 'outdated');
  assert.match(changes.diff, /^- 二行目$/m);
  assert.match(changes.diff, /^\+ 二行目を書き直した$/m);

  site.write({ id, lang: 'zh', body: '第一行\n\n重写了第二行', from: 'ja' });
  assert.equal(site.get({ id, lang: 'zh' }).state, 'current');
});

test('a change to a shared field reaches every language and leaves the translation current', () => {
  const site = bilingual();
  const { id } = site.write({ title: 'T', body: 'B', date: '2026-08-10T03:00:00Z' });
  site.write({ id, lang: 'zh', title: '中', body: '文', from: 'ja' });

  // From the source…
  const ja = site.write({ id, date: '2026-09-01T00:00:00Z', fields: { image: '/uploads/b.webp' } });
  assert.deepEqual(ja.written.sort(), [`src/content/news/${id}.md`, `src/content/news/${id}.zh.md`]);
  let zh = site.get({ id, lang: 'zh' });
  assert.equal(zh.date, '2026-09-01T00:00:00.000Z');
  assert.equal(zh.fields.image, '/uploads/b.webp');
  assert.equal(zh.state, 'current');

  // …and from the translation
  site.write({ id, lang: 'zh', date: '2026-09-02T00:00:00Z' });
  assert.equal(site.get({ id }).date, '2026-09-02T00:00:00.000Z');
  zh = site.get({ id, lang: 'zh' });
  assert.equal(zh.state, 'current');

  // Tags are each language's own unless the collection shares them
  site.write({ id, tags: ['学部'] });
  assert.deepEqual(site.get({ id, lang: 'zh' }).tags, []);
});

test('a typo fixed in the source can be marked as needing nothing from the translation', () => {
  const site = bilingual();
  const { id } = site.write({ title: 'T', body: 'B' });
  site.write({ id, lang: 'zh', title: '中', body: '文', from: 'ja' });
  site.write({ id, body: 'B.' });
  assert.equal(site.get({ id, lang: 'zh' }).state, 'outdated');
  const zh = site.markCurrent({ id, lang: 'zh' });
  assert.equal(zh.state, 'current');
  assert.equal(zh.body, '文\n');
});

test('an article only in the second language is listed as missing the first', () => {
  const site = bilingual();
  const { id } = site.write({ lang: 'zh', title: '只有中文', body: '正文' });
  assert.equal(existsSync(join(root, `src/content/news/${id}.zh.md`)), true);
  const row = site.list({ status: 'missing' }).articles.find((a) => a.id === id);
  assert.deepEqual(
    row.versions.map((v) => [v.lang, v.state]),
    [
      ['ja', 'missing'],
      ['zh', 'original'],
    ],
  );
});

test('mistakes are explained, so the AI can correct them', () => {
  const site = bilingual();
  assert.throws(() => site.write({ title: 'T' }), ContentError);
  assert.throws(() => site.write({ title: 'T', body: 'B', lang: 'fr' }), /ja, zh/);
  assert.throws(() => site.write({ id: '../x', title: 'T', body: 'B' }), /Not an article id/);
  assert.throws(() => site.write({ title: 'T', body: '![](/uploads/nope.webp)' }), /add_image/);
  const { id } = site.write({ title: 'T', body: 'B' });
  assert.throws(() => site.write({ id, lang: 'zh', title: '中', body: '文', from: 'zh' }), /itself/);
  assert.throws(() => site.get({ id, lang: 'zh' }), /no zh version/);
});

test('a one-language site reads and writes exactly as before', () => {
  const site = makeSite({ collections: [{ dir: 'src/content/news' }] });
  writeFileSync(join(root, 'src/content/news/202601010000.md'), '---\ntitle: "Old"\ndescription: ""\ndate: 2026-01-01T00:00:00.000Z\ntags: []\n---\n\nBody\n');
  const list = site.list();
  assert.deepEqual(list.languages, []);
  assert.deepEqual(list.articles[0].versions, [{ lang: null, title: 'Old', draft: false, state: 'original' }]);
  assert.throws(() => site.write({ id: '202601010000', lang: 'zh', body: 'x' }), /one language/);
  const a = site.write({ id: '202601010000', body: 'New body' });
  assert.equal(a.lang, null);
  assert.deepEqual(a.written, ['src/content/news/202601010000.md']);
});

test('commit takes only the content and media, and does not push', async () => {
  const site = bilingual();
  writeFileSync(join(root, 'README.md'), 'changed, and not ours to commit\n');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const img = await site.addImage({ source: png });
  assert.match(img.src, /^\/uploads\/\d{8}\/[0-9a-f]{16}\.(png|webp)$/);
  site.write({ title: 'T', body: `![](${img.src})` });
  const made = site.commit({ message: 'Add an article' });
  assert.equal(made.branch, 'main');
  assert.equal(made.files.length, 2);
  assert.equal(git('status', '--porcelain'), 'M README.md');
  assert.deepEqual(site.commit({ message: 'again' }), { commit: null, message: 'Nothing to commit.' });
});
