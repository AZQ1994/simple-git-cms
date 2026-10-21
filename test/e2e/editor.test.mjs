// The editor, driven in a real browser against a GitHub that only exists in memory. What the unit
// tests can't reach: that the interface the person actually clicks still ends up making the right
// commit. Run with `npm run test:e2e` (needs a Chrome; see test/e2e/README.md).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome, launchChrome, openPage, sleep } from './cdp.mjs';
import { CONTENT_DIR, MEDIA_DIR, startFakeGitHub } from './fake-github.mjs';
import { startEditor } from './serve.mjs';
import { policyFromReadme } from './policy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(root, 'dist');

let gh;
let site;
let policy;
let chrome;
let page;

before(async () => {
  assert.ok(existsSync(join(dist, 'app.js')), 'run `npm run build` first — these tests drive the built editor');
  assert.ok(findChrome(), 'no Chrome found; set CHROME_PATH');

  gh = await startFakeGitHub();
  // The editor is served exactly as the README says to serve it, with the fake GitHub standing in
  // for api.github.com. If the policy and the editor ever stop agreeing, these tests say so.
  policy = policyFromReadme().replace('https://api.github.com', gh.origin);
  site = await startEditor({
    root: dist,
    headers: {
      'Content-Security-Policy': policy,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
    config: {
      title: 'Test',
      siteName: 'Test site',
      repo: 'owner/repo',
      branch: 'main',
      siteUrl: 'http://example.invalid',
      timeZone: 'UTC',
      auth: { base: 'http://auth.invalid' },
      collection: { label: 'news', dir: CONTENT_DIR, url: '/news/{id}/' },
      media: { dir: MEDIA_DIR, url: '/uploads' },
    },
  });
  chrome = await launchChrome();
  page = await openPage(chrome.port);

  // The API override and the interface language are only read at startup, so set them and reload
  await page.navigate(site.origin);
  await page.evaluate(`localStorage.setItem('simple-git-cms-api', ${JSON.stringify(gh.origin)}); localStorage.setItem('simple-git-cms-lang', 'en'); localStorage.clear === null`);
  await page.navigate(site.origin);
  await page.until(`!document.getElementById('login').hidden`, { label: 'the sign-in screen' });
});

after(async () => {
  page?.close();
  await chrome?.close();
  await site?.close();
  await gh?.close();
});

const titleOf = (n) => `document.querySelectorAll('#list .item')[${n}].querySelector('.item-title').textContent`;
const openArticle = async (n) => {
  await page.evaluate(`document.querySelectorAll('#list .item')[${n}].click()`);
  await page.until(`!document.getElementById('doc').hidden`, { label: 'the article form' });
};
const setTitle = (text) =>
  page.evaluate(`(() => { const el = document.getElementById('f-title'); el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const typeBody = async (text) => {
  await page.evaluate(`(document.querySelector('#body .ProseMirror') ?? document.getElementById('body')).focus()`);
  await page.send('Input.insertText', { text });
  await sleep(200);
};
const save = async () => {
  const before = gh.commits.length;
  await page.evaluate(`document.getElementById('btn-save').click()`);
  for (let i = 0; i < 100 && gh.commits.length === before; i++) await sleep(100);
  assert.equal(gh.commits.length, before + 1, 'saving should make exactly one commit');
  await sleep(300);
};

test('signing in with a token shows what is in the repository', async () => {
  await page.evaluate(`(() => {
    const form = document.getElementById('token-form');
    form.token.value = 'a-token';
    form.requestSubmit();
  })()`);
  await page.until(`!document.getElementById('app').hidden`, { label: 'the editor' });
  await page.until(`document.querySelectorAll('#list .item').length === 3`, { label: 'three articles' });

  assert.equal(await page.evaluate(`document.getElementById('user-name').textContent`), 'Tester');
  assert.equal(await page.evaluate(titleOf(0)), 'Spring term enrolment is open');
  assert.equal(await page.evaluate(`document.getElementById('count-draft').textContent`), '1');
});

test('opening an article shows what the file says', async () => {
  await openArticle(1);
  assert.equal(await page.evaluate(`document.getElementById('f-title').value`), 'Autumn festival photos');
  assert.match(await page.evaluate(`document.getElementById('body').textContent`), /Thank you to everyone/);
  assert.equal(await page.evaluate(`location.search`), '?id=202610120800', 'the open article belongs in the address bar');
});

test('saving writes one commit, and the file says what the editor showed', async () => {
  await setTitle('Autumn festival photos, corrected');
  await typeBody(' It rained in the morning.');
  await save();

  const file = gh.files.get(`${CONTENT_DIR}/202610120800.md`);
  assert.match(file, /^title: "Autumn festival photos, corrected"$/m);
  assert.match(file, /It rained in the morning\./);
  assert.doesNotMatch(gh.commits.at(-1).message, /\[skip ci\]/, 'this article is published, so the site has to be rebuilt');
  assert.equal(await page.evaluate(titleOf(1)), 'Autumn festival photos, corrected', 'the list should follow');
});

test('saving a draft leaves the site alone', async () => {
  await openArticle(2);
  assert.equal(await page.evaluate(`document.getElementById('f-title').value`), 'Draft: timetable changes');
  await typeBody(' Rooms to be confirmed.');
  await save();

  assert.match(gh.files.get(`${CONTENT_DIR}/202610010000.md`), /Rooms to be confirmed\./);
  assert.match(gh.commits.at(-1).message, /^\[skip ci\] /, 'a draft save should not trigger a build');
});

test('a new article gets an id of its own', async () => {
  await page.evaluate(`document.getElementById('new-article').click()`);
  await page.until(`document.getElementById('f-title').value === ''`, { label: 'an empty form' });
  await setTitle('Written by the test');
  await typeBody('A body, which the editor insists on.');
  await save();

  const id = await page.evaluate(`new URLSearchParams(location.search).get('id')`);
  assert.match(id, /^\d{12}$/, 'the id is the minute it was created');
  assert.ok(gh.files.has(`${CONTENT_DIR}/${id}.md`), 'the new article should be a file in the repository');
  assert.match(gh.files.get(`${CONTENT_DIR}/${id}.md`), /^draft: true$/m);
  await page.until(`document.querySelectorAll('#list .item').length === 4`, { label: 'four articles' });
});

test('publishing a draft drops the draft flag and builds the site', async () => {
  const id = await page.evaluate(`new URLSearchParams(location.search).get('id')`);
  const before = gh.commits.length;
  await page.evaluate(`document.getElementById('btn-publish').click()`);
  for (let i = 0; i < 100 && gh.commits.length === before; i++) await sleep(100);

  assert.doesNotMatch(gh.files.get(`${CONTENT_DIR}/${id}.md`), /^draft: true$/m);
  assert.doesNotMatch(gh.commits.at(-1).message, /\[skip ci\]/, 'publishing should let CI run');
});

test('deleting takes the file with it', async () => {
  const id = await page.evaluate(`new URLSearchParams(location.search).get('id')`);
  await page.evaluate(`document.getElementById('btn-unpublish').click()`); // only drafts can be deleted
  await sleep(1200);
  const before = gh.commits.length;
  await page.evaluate(`document.getElementById('btn-delete').click()`);
  for (let i = 0; i < 100 && gh.commits.length === before; i++) await sleep(100);

  assert.equal(gh.files.has(`${CONTENT_DIR}/${id}.md`), false, 'the file should be gone');
  await page.until(`document.querySelectorAll('#list .item').length === 3`, { label: 'three articles again' });
});

test('nothing went wrong in the browser', async () => {
  // One 404 is meant: newId() asks GitHub whether an id is taken, and "not found" is the yes it
  // wants. Everything else is a mistake.
  const failed = await page.evaluate(
    `JSON.stringify(performance.getEntriesByType('resource')
      .filter((r) => r.responseStatus >= 400 && !/\\/contents\\/.*\\.md\\?ref=/.test(r.name))
      .map((r) => r.name + ' -> ' + r.responseStatus))`,
  );
  assert.deepEqual(JSON.parse(failed), [], 'every request the editor makes should succeed');
  // Network entries are the same requests the check above already judged, so they aren't news
  assert.deepEqual(page.logs.filter((l) => !l.startsWith('[network]')), []);
});

// Last, because the browser logs a refused script and the check above would count that as trouble
test('all of that happened under the policy the README recommends, and it bites', async () => {
  assert.match(policy, /^default-src 'none';/);
  assert.doesNotMatch(policy, /unsafe-eval/);
  assert.doesNotMatch(policy, /script-src[^;]*unsafe-inline/);

  const ran = await page.evaluate(`(() => {
    window.__injected = false;
    const s = document.createElement('script');
    s.textContent = 'window.__injected = true';
    document.body.append(s);
    return window.__injected;
  })()`);
  assert.equal(ran, false, 'the policy has to be in force, not merely printed in the README');
});
