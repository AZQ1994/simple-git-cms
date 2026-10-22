// The editor, driven in a real browser against a GitHub that only exists in memory. What the unit
// tests can't reach: that the interface the person actually clicks still ends up making the right
// commit. Run with `npm run test:e2e` (needs a Chrome; see test/e2e/README.md).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome, launchChrome, openPage, sleep } from './cdp.mjs';
import { BLOCK, CONTENT_DIR, EMBED, HTML_TABLE, MEDIA_DIR, TABLE, VIDEO, startFakeGitHub } from './fake-github.mjs';
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
    // The site's own preview page, with the client it imports taken straight from integrations/
    routes: {
      '/preview/index.html': join(root, 'test', 'e2e', 'preview', 'index.html'),
      '/preview/preview-page.js': join(root, 'test', 'e2e', 'preview', 'preview-page.js'),
      '/preview/preview-client.js': join(root, 'integrations', 'preview-client.js'),
    },
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
      collection: { label: 'news', dir: CONTENT_DIR, url: '/news/{id}/', imageField: 'image' },
      media: { dir: MEDIA_DIR, url: '/uploads' },
      preview: { url: '/preview/' },
      blocks: [
        { tag: 'YouTube', label: 'YouTube', fields: [{ name: 'id', label: 'Video' }, { name: 'start', label: 'Start' }] },
        { tag: 'table', label: 'Advanced table', edit: 'table' },
        { tag: 'aside', name: 'notice', label: 'Notice', attrs: { class: 'notice' }, fields: [{ name: 'text', from: 'content', multiline: true }] },
        // One kind of iframe, not every iframe: the YouTube embed below is left as source
        { tag: 'iframe', name: 'video', label: 'Video', starts: { src: 'https://player.vimeo.com/video/' }, fields: [{ name: 'src', label: 'Address' }] },
      ],
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
const middleOf = async (selector, n) =>
  JSON.parse(
    await page.evaluate(
      `(() => { const r = document.querySelectorAll(${JSON.stringify(selector)})[${n}].getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 }); })()`,
    ),
  );
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

test('a table, an HTML embed and a block the site defined come back out byte for byte', async () => {
  await openArticle(0);
  // Both spellings are tables here: the pipe one, and the HTML one with a header across two columns
  assert.equal(await page.evaluate(`document.querySelectorAll('#body table').length`), 2, 'the HTML one is a table too, not a box of source');
  assert.equal(await page.evaluate(`document.querySelector('#body th[colspan="2"]').textContent`), 'Spring');
  // A table is the one thing in the body with a shape of its own; if the editor's idea of it and
  // the file's ever drift apart, every save of an untouched table would churn the file
  assert.equal(await page.evaluate(`document.querySelectorAll('#body .html-block').length`), 1, 'the embed should be a box of its own');
  assert.equal(await page.evaluate(`document.querySelector('#body .html-block textarea').value`), EMBED, 'showing what the file says');
  await setTitle('Spring term enrolment is open');
  await save();
  const file = gh.files.get(`${CONTENT_DIR}/202610150930.md`);
  assert.ok(file.includes(TABLE), 'the table should be written back exactly as it was read');
  assert.ok(file.includes(HTML_TABLE), 'and the HTML one, which is a table in the editor all the same');
  assert.ok(file.includes(EMBED), 'and so should the embed, which the editor understands nothing about');
  assert.ok(file.includes(BLOCK), 'and the block, which exists only because config.json describes it');
});

test('an embed as the service hands it over is one field, with the rest of it folded away', async () => {
  await openArticle(0);
  const card = `[...document.querySelectorAll('#body .block-card')].find((c) => c.querySelector('.block-more'))`;
  assert.equal(await page.evaluate(`${card}.querySelectorAll(':scope > .block-field').length`), 1, 'the address, and nothing else in the way');
  assert.equal(await page.evaluate(`${card}.querySelector(':scope > .block-field input').value`), 'https://player.vimeo.com/video/76979871?h=8272103f6e');
  assert.equal(await page.evaluate(`${card}.querySelector('.block-more').open`), false, 'the other seven are folded away');
  assert.equal(await page.evaluate(`${card}.querySelectorAll('.block-more .block-field').length`), 7, 'but still there, and still editable');
  assert.match(await page.evaluate(`${card}.querySelector('.block-more summary').textContent`), /^Other attributes \(7\)/);

  // The embed next to it is an iframe too, and no definition speaks for it
  assert.equal(await page.evaluate(`document.querySelector('#body .html-block textarea').value`), EMBED, 'left as source');

  await save();
  assert.ok(gh.files.get(`${CONTENT_DIR}/202610150930.md`).includes(VIDEO), 'and all eight attributes go back exactly as they were');
});

test('a plain table offers no merging; the advanced one does, and is written as HTML', async () => {
  await openArticle(2); // the draft, which has nothing in it yet
  await page.evaluate(`document.querySelector('#toolbar [data-cmd="table"]').click()`);
  await page.until(`!document.getElementById('table-bar').hidden`, { label: 'the table bar' });
  // A pipe table cannot say that a cell spans two, so the bar does not pretend it can
  assert.equal(await page.evaluate(`document.querySelector('#table-bar [data-table="merge"]').hidden`), true);
  assert.equal(
    await page.evaluate(`document.querySelector('#table-bar [data-table="advanced"] .tb-label').textContent`),
    'Advanced table',
    'the way to a table that can is the block the site defined',
  );

  await page.evaluate(`document.querySelector('#table-bar [data-table="advanced"]').click()`);
  await page.until(`!document.querySelector('#table-bar [data-table="merge"]').hidden`, { label: 'the merge button' });
  // drag across the first two header cells, which is how a person selects them
  await page.drag(await middleOf('#body th', 0), await middleOf('#body th', 1));
  await page.evaluate(`document.querySelector('#table-bar [data-table="merge"]').click()`);
  await page.until(`document.querySelector('#body th[colspan="2"]')`, { label: 'a merged cell' });

  await save();
  assert.match(gh.files.get(`${CONTENT_DIR}/202610010000.md`), /<th colspan="2">/);
});

test('a block defined in config.json is a card with its own fields', async () => {
  await openArticle(0);
  assert.equal(await page.evaluate(`document.querySelector('#body .block-card .html-label').textContent`), 'YouTube');
  assert.equal(await page.evaluate(`document.querySelector('#body .block-card input').value`), 'dQw4w9WgXcQ');

  await page.evaluate(`(() => {
    const i = document.querySelector('#body .block-card input');
    i.value = 'zzz';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await save();
  assert.match(gh.files.get(`${CONTENT_DIR}/202610150930.md`), /<YouTube id="zzz" \/>/, 'the template is how it goes back');
});

test('the insert menu offers the blocks the site defined, and inserting one writes the template', async () => {
  await openArticle(2); // the draft
  await page.evaluate(`document.querySelector('#toolbar [data-menu]').click()`);
  await page.until(`!document.getElementById('insert-list').hidden`, { label: 'the insert menu' });
  await page.evaluate(`document.querySelector('#insert-list [data-block="YouTube"]').click()`);
  await page.until(`document.querySelectorAll('#body .block-card').length === 1`, { label: 'the card' });
  assert.equal(await page.evaluate(`document.getElementById('insert-list').hidden`), true, 'and the menu closes behind it');
  await page.evaluate(`(() => {
    const i = document.querySelector('#body .block-card input');
    i.value = 'newly-added';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await save();
  assert.match(gh.files.get(`${CONTENT_DIR}/202610010000.md`), /<YouTube id="newly-added" \/>/);
});

test('two paragraphs in a block stay one block, instead of stranding the closing tag', async () => {
  await openArticle(2); // the draft
  await page.evaluate(`document.querySelector('#toolbar [data-menu]').click()`);
  await page.until(`!document.getElementById('insert-list').hidden`, { label: 'the insert menu' });
  await page.evaluate(`document.querySelector('#insert-list [data-block="notice"]').click()`);
  await page.until(`document.querySelector('#body .block-card textarea')`, { label: 'the notice' });
  await page.evaluate(`(() => {
    const t = document.querySelector('#body .block-card textarea');
    t.value = 'Rooms are not confirmed.\\n\\nMore to follow.';
    t.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await save();

  const file = gh.files.get(`${CONTENT_DIR}/202610010000.md`);
  assert.match(file, /<aside class="notice">Rooms are not confirmed\.\n\nMore to follow\.<\/aside>/);

  // Markdown ends a block of HTML at a blank line, so opening this again is where it used to fall
  // apart: an opening tag in a box, and </aside> sitting in the text
  await openArticle(0);
  await openArticle(2);
  await page.until(`document.querySelector('#body .block-card textarea')`, { label: 'the notice again' });
  assert.equal(await page.evaluate(`document.querySelectorAll('#body .block-card').length`), 2, 'the notice and the block that was already there, and nothing broken off either');
  assert.doesNotMatch(await page.evaluate(`document.getElementById('body').textContent`), /<\/aside>/, 'no closing tag in the text');
  await save();
  assert.equal(gh.files.get(`${CONTENT_DIR}/202610010000.md`), file, 'and saving it again leaves the file alone');
});

test('an embed pasted straight into the body lands as the thing it is', async () => {
  await openArticle(2); // the draft
  const paste = (text) =>
    page.evaluate(`(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', ${JSON.stringify(text)});
      document.querySelector('#body .ProseMirror').focus();
      document.querySelector('#body .ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    })()`);

  // <iframe> is not in the editor's schema, so pasting this used to leave nothing at all
  const cards = await page.evaluate(`document.querySelectorAll('#body .block-card').length`);
  await paste(VIDEO);
  await page.until(`document.querySelectorAll('#body .block-card').length === ${cards + 1}`, { label: 'the video card' });

  // and markup no definition claims is pasted as the box of source it would be read as
  const boxes = await page.evaluate(`document.querySelectorAll('#body .html-block').length`);
  await paste('<div class="gallery">someone else’s markup</div>');
  await page.until(`document.querySelectorAll('#body .html-block').length === ${boxes + 1}`, { label: 'the source box' });

  // Ordinary text is still ordinary text
  await paste('A sentence about <b> and other tags.');
  await sleep(200);
  assert.equal(await page.evaluate(`document.querySelectorAll('#body .html-block').length`), boxes + 1, 'not everything with a bracket in it is markup');

  await save();
  const file = gh.files.get(`${CONTENT_DIR}/202610010000.md`);
  assert.ok(file.includes(VIDEO), 'the embed goes in exactly as it was pasted');
  assert.ok(file.includes('<div class="gallery">someone else’s markup</div>'));
});

test('a box can be taken out again: Backspace in an empty one, or the × on it', async () => {
  await openArticle(2); // the draft, which by now has a block or two in it
  const count = (what) => page.evaluate(`document.querySelectorAll('#body ${what}').length`);
  const [cardsBefore, boxesBefore] = [await count('.block-card'), await count('.html-block')];

  // An empty HTML box: everything typed in it belongs to the text area, so Backspace never
  // reached the editor and the box could not be deleted at all
  await page.evaluate(`document.querySelector('#toolbar [data-menu]').click()`);
  await page.until(`!document.getElementById('insert-list').hidden`, { label: 'the insert menu' });
  await page.evaluate(`document.querySelector('#insert-list [data-cmd="html"]').click()`);
  await page.until(`document.querySelector('#body .html-block textarea')`, { label: 'the box' });
  await page.until(`document.querySelectorAll('#body .html-block').length === ${boxesBefore + 1}`, { label: 'one box more' });
  await page.evaluate(`[...document.querySelectorAll('#body .html-block textarea')].find((t) => !t.value).focus()`);
  await page.press('Backspace');
  await page.until(`document.querySelectorAll('#body .html-block').length === ${boxesBefore}`, { label: 'the box to go' });

  // And the × takes a filled-in one out, which the mouse otherwise cannot reach
  await page.evaluate(`document.querySelector('#body .block-card .node-remove').click()`);
  await page.until(`document.querySelectorAll('#body .block-card').length === ${cardsBefore - 1}`, { label: 'one card fewer' });
});

test('the mouse selects words inside a box instead of dragging the box', async () => {
  await openArticle(0);
  const box = `document.querySelector('#body .html-block')`;
  assert.equal(await page.evaluate(`${box}.draggable`), true, 'a box is draggable, which is how it is moved');

  // A draggable element swallows the mouse, so it stops being one while the mouse is down inside
  await page.evaluate(`${box}.scrollIntoView({ block: 'center' })`);
  await sleep(200);
  const at = await middleOf('#body .html-block textarea', 0);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, button: 'left', buttons: 1, clickCount: 1 });
  assert.equal(await page.evaluate(`${box}.draggable`), false, 'not while a word is being selected');
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(100);
  assert.equal(await page.evaluate(`${box}.draggable`), true, 'and draggable again afterwards');

  // and the sweep itself selects words, which is the whole point
  const text = await middleOf('#body .html-block textarea', 0);
  await page.drag({ x: text.x - 60, y: text.y }, { x: text.x + 60, y: text.y });
  const picked = await page.evaluate(`(() => { const t = document.querySelector('#body .html-block textarea'); return t.value.slice(t.selectionStart, t.selectionEnd); })()`);
  assert.ok(picked.length > 2, `the mouse should have selected some of the source, but picked ${JSON.stringify(picked)}`);

  // Pressing anywhere else in the box still drags it
  const frame = await middleOf('#body .html-block .html-label', 0);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...frame, button: 'left', buttons: 1, clickCount: 1 });
  assert.equal(await page.evaluate(`${box}.draggable`), true);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...frame, button: 'left', buttons: 1, clickCount: 1 });
});

test('dragging a box moves the box, and nothing else that happened to be selected', async () => {
  await openArticle(0);
  const dragFrom = (selector) =>
    page.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.dispatchEvent(new DragEvent('dragstart', { dataTransfer: new DataTransfer(), bubbles: true, cancelable: true }));
      const d = window.cmsEditor.view.dragging;
      const out = JSON.stringify({ dragging: Boolean(d), blocks: d?.slice.content.childCount ?? 0, first: d?.slice.content.firstChild?.type.name ?? null });
      el.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
      window.cmsEditor.view.dragging = null;
      return out;
    })()`);

  // Select a stretch of the article first: that selection is what used to be dragged instead
  await page.evaluate(`window.cmsEditor.commands.selectAll()`);
  assert.deepEqual(JSON.parse(await dragFrom('#body .html-block')), { dragging: true, blocks: 1, first: 'htmlBlock' }, 'the one box');

  // A drag that starts inside the text area is the text area moving its own words
  assert.deepEqual(JSON.parse(await dragFrom('#body .html-block textarea')), { dragging: false, blocks: 0, first: null });
});

test('pressing a box selects the box, so that is what the mouse carries', async () => {
  await openArticle(0);
  // Whatever was selected before: the browser puts it back when the press moves the keyboard into
  // the editor, and then it is in the picture under the mouse too
  await page.evaluate(`window.cmsEditor.commands.selectAll()`);
  await page.evaluate(`document.querySelector('#body .html-block').scrollIntoView({ block: 'center' })`);
  await sleep(200);

  const frame = await middleOf('#body .html-block .html-label', 0);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...frame, button: 'left', buttons: 1, clickCount: 1 });
  // What the browser would draw under the mouse is what it has selected, so that has to be the box
  const picture = await page.evaluate(`(() => {
    const box = document.querySelector('#body .html-block');
    const s = getSelection();
    const r = s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
    const b = box.getBoundingClientRect();
    return JSON.stringify({
      selected: window.cmsEditor.state.selection.node?.type.name ?? null,
      top: r ? Math.round(r.top - b.top) : null,
      bottom: r ? Math.round(r.bottom - b.bottom) : null,
    });
  })()`);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...frame, button: 'left', buttons: 0, clickCount: 1 });

  assert.deepEqual(JSON.parse(picture), { selected: 'htmlBlock', top: 0, bottom: 0 }, 'the box, and nothing under it');
  await page.evaluate(`window.cmsEditor.commands.focus('end')`); // the box is selected now; leave the caret in the text
});

test('the keyboard can get into a box and back out of it', async () => {
  // A paragraph and a box under it, which is the shape this is about
  await page.evaluate(`document.getElementById('new-article').click()`);
  await page.until(`document.getElementById('f-title').value === ''`, { label: 'an empty form' });
  await typeBody('A line, and a box under it.');
  await page.evaluate(`document.querySelector('#toolbar [data-menu]').click()`);
  await page.until(`!document.getElementById('insert-list').hidden`, { label: 'the insert menu' });
  await page.evaluate(`document.querySelector('#insert-list [data-cmd="html"]').click()`);
  await page.until(`document.querySelector('#body .html-block textarea')`, { label: 'the box' });

  const where = () => page.evaluate(`document.activeElement.tagName + (document.activeElement.closest('.html-block') ? ' in-box' : ' out')`);
  await page.evaluate(`document.querySelector('#body .html-block textarea').focus()`);
  assert.equal(await where(), 'TEXTAREA in-box');

  // Escape leaves the box selected, which is where the arrow keys and Backspace work again
  await page.press('Escape');
  await page.until(`document.querySelector('#body .html-block.selected')`, { label: 'the box to be selected' });
  assert.match(await where(), /out$/, 'and the editor has the keyboard back');

  // The arrow keys are how you reach a box without the mouse: off it, and onto it again
  await page.press('ArrowUp');
  await page.until(`!document.querySelector('#body .html-block.selected')`, { label: 'the selection to leave the box' });
  await page.press('ArrowDown');
  await page.until(`document.querySelector('#body .html-block.selected')`, { label: 'the box to be selected again' });

  // and Enter steps into whatever is selected
  await page.press('Enter');
  await page.until(`document.activeElement.tagName === 'TEXTAREA'`, { label: 'the text area' });
  assert.equal(await where(), 'TEXTAREA in-box');
});

test('filling in a second field keeps what the first one says', async () => {
  await openArticle(0);
  const setField = (n, value) =>
    page.evaluate(`(() => {
      const i = document.querySelectorAll('#body .block-card input')[${n}];
      i.value = ${JSON.stringify(value)};
      i.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  await setField(0, 'abc');
  await setField(1, '30');
  await save();
  assert.match(gh.files.get(`${CONTENT_DIR}/202610150930.md`), /<YouTube id="abc" start="30" \/>/);
});

test('the HTML box can be edited, and that is what gets committed', async () => {
  await openArticle(0);
  await page.evaluate(`(() => {
    const t = document.querySelector('#body .html-block textarea');
    t.value = '<iframe src="https://www.youtube.com/embed/zzz" allowfullscreen></iframe>';
    t.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await save();
  assert.match(gh.files.get(`${CONTENT_DIR}/202610150930.md`), /embed\/zzz/);
});

test('a tag that is never closed is marked, and saving says what it would do to the page', async () => {
  await openArticle(0);
  const setBox = (html) =>
    page.evaluate(`(() => {
      const t = document.querySelector('#body .html-block textarea');
      t.value = ${JSON.stringify(html)};
      t.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);

  // One line like this in one article wraps the rest of the page it lands on, which is why the
  // editor reads the body's HTML as one run rather than block by block
  await setBox('<div style="color: red">aaaaaa');
  await page.until(`document.querySelector('#body .html-block.html-broken')`, { label: 'the box to be marked' });
  await save();
  assert.match(page.dialogs.at(-1) ?? '', /<div> is never closed/, 'saving has to say so');

  // The same tag typed into the sentence itself, which is where someone writing by hand puts it
  await setBox('');
  await page.evaluate(`window.cmsEditor.commands.focus('end')`); // where the typing below goes
  await typeBody('<div style="color: red">aaaaaa');
  await page.until(`document.querySelector('#body .html-broken-tag')`, { label: 'the tag to be marked where it stands' });
  assert.equal(
    await page.evaluate(`document.querySelector('#body .html-broken-tag').textContent`),
    '<div style="color: red">',
    'the tag itself, not the sentence around it',
  );

  // and Update asks about it, not only Save
  const before = gh.commits.length;
  await page.evaluate(`document.getElementById('btn-publish').click()`);
  for (let i = 0; i < 60 && gh.commits.length === before; i++) await sleep(100);
  assert.match(page.dialogs.at(-1) ?? '', /<div> is never closed/);

  await page.evaluate(`window.cmsEditor.commands.focus('end')`); // the Update button has the keyboard now
  await typeBody('</div>');
  await page.until(`!document.querySelector('#body .html-broken-tag')`, { label: 'the mark to go' });
  const asked = page.dialogs.length;
  await save();
  assert.equal(page.dialogs.length, asked, 'and once it closes there is nothing to ask about');
  assert.match(gh.files.get(`${CONTENT_DIR}/202610150930.md`), /<div style="color: red">aaaaaa<\/div>/);
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

test('a table built with the toolbar is saved as a GFM table', async () => {
  await page.evaluate(`document.getElementById('new-article').click()`);
  await page.until(`document.getElementById('f-title').value === ''`, { label: 'an empty form' });
  await setTitle('Opening hours');
  await typeBody('When the office is open:');

  await page.evaluate(`document.querySelector('#toolbar [data-cmd="table"]').click()`);
  await page.until(`!document.getElementById('table-bar').hidden`, { label: 'the table bar' });
  // The cursor starts in the first header cell, so this centres the first column
  await page.evaluate(`document.querySelector('#table-bar [data-table="align"]').click()`);

  for (const cell of ['Day', 'Open', 'Close', 'Mon', '9:00', '17:00']) {
    await page.send('Input.insertText', { text: cell });
    await page.press('Tab');
  }
  // Tab left the cursor in the empty third row, which the bar can drop
  await page.evaluate(`document.querySelector('#table-bar [data-table="rowDelete"]').click()`);
  await save();

  const id = await page.evaluate(`new URLSearchParams(location.search).get('id')`);
  assert.ok(
    gh.files.get(`${CONTENT_DIR}/${id}.md`).includes(['| Day | Open | Close |', '| :-: | ---- | ----- |', '| Mon | 9:00 | 17:00 |'].join('\n')),
    `the table in the file was:\n${gh.files.get(`${CONTENT_DIR}/${id}.md`)}`,
  );
});

test('a cover image is uploaded with the article and named in the frontmatter', async () => {
  // A 4x4 PNG; the editor compresses whatever it is given to webp, so the format going in only
  // has to be something a browser can decode
  const file = join(tmpdir(), 'sgcms-cover.png');
  writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGM4YaMBRwzEcQDxwxLBXOwG1wAAAABJRU5ErkJggg==', 'base64'));

  await openArticle(1);
  const id = await page.evaluate(`new URLSearchParams(location.search).get('id')`);
  assert.equal(await page.evaluate(`document.getElementById('cover').hidden`), false, 'the control appears because config names a field');
  await page.evaluate(`document.getElementById('cover-pick').click()`);
  await page.chooseFile('#cover-input', file);
  await page.until(`!document.getElementById('cover-img').hidden`, { label: 'the cover thumbnail' });
  await save();

  const saved = gh.files.get(`${CONTENT_DIR}/${id}.md`);
  const [, path] = saved.match(/^image: (.+)$/m) ?? [];
  assert.ok(path, `the frontmatter should name the cover:\n${saved}`);
  assert.match(path, /^\/uploads\/\d{8}\/\w+\.webp$/);
  assert.ok(gh.files.has(path.replace('/uploads', MEDIA_DIR)), 'the image itself has to be in the same commit');

  // and taking it off again takes the field with it
  await page.evaluate(`document.querySelector('#cover-acts [data-cover="remove"]').click()`);
  await save();
  assert.doesNotMatch(gh.files.get(`${CONTENT_DIR}/${id}.md`), /^image:/m);
});

test('the preview is sent the cover before it is saved, as a picture it can load', async () => {
  const file = join(tmpdir(), 'sgcms-preview-cover.png');
  writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGM4YaMBRwzEcQDxwxLBXOwG1wAAAABJRU5ErkJggg==', 'base64'));

  await openArticle(1);
  await page.evaluate(`document.getElementById('cover-pick').click()`);
  await page.evaluate(`document.getElementById('media-modal').hidden || document.querySelector('[data-media="upload"]').click()`);
  await page.chooseFile('#cover-input', file);
  await page.until(`!document.getElementById('cover-img').hidden`, { label: 'the cover thumbnail' });

  await page.evaluate(`document.getElementById('btn-preview').click()`);
  const frame = `document.getElementById('preview-frame').contentWindow`;
  await page.until(`${frame}.received?.image`, { label: 'the article in the preview page' });
  const got = await page.evaluate(`({ image: ${frame}.received.image, fields: ${frame}.received.fields })`);
  assert.match(got.image, /^blob:/, 'not uploaded yet, so the page is handed an address it can load');
  assert.match(got.fields.image, /^\/uploads\/\d{8}\/\w+\.webp$/, 'and the rest of the frontmatter is there as the file will have it');
  await page.until(`${frame}.document.getElementById('cover').naturalWidth > 0`, { label: 'the cover to load in the preview' });

  await page.evaluate(`document.getElementById('preview-close').click()`);
  await page.evaluate(`document.querySelector('#cover-acts [data-cover="remove"]').click()`);
});

test('a cover can be a picture the article already has, rather than a second copy of it', async () => {
  const file = join(tmpdir(), 'sgcms-body.png');
  writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGM4YaMBRwzEcQDxwxLBXOwG1wAAAABJRU5ErkJggg==', 'base64'));

  const id = await page.evaluate(`new URLSearchParams(location.search).get('id')`);
  await page.evaluate(`document.querySelector('#toolbar [data-cmd="image"]').click()`);
  await page.chooseFile('#file-input', file);
  await page.until(`document.querySelector('#body .img-node img')`, { label: 'the image in the body' });

  // The cover control offers what the article has before it offers a file chooser
  await page.evaluate(`document.getElementById('cover-pick').click()`);
  await page.until(`!document.getElementById('media-modal').hidden`, { label: 'the picker' });
  assert.equal(await page.evaluate(`document.querySelectorAll('#media-grid .media-tile').length`), 1, 'the one image this article has');
  await page.evaluate(`document.querySelector('#media-grid .media-tile').click()`);
  await page.until(`document.getElementById('media-modal').hidden`, { label: 'the picker to close' });
  await page.until(`!document.getElementById('cover-img').hidden`, { label: 'the cover thumbnail' });

  const uploads = () => [...gh.files.keys()].filter((k) => k.startsWith(MEDIA_DIR)).length;
  const before = uploads();
  await save();

  const saved = gh.files.get(`${CONTENT_DIR}/${id}.md`);
  const [, path] = saved.match(/^image: (.+)$/m) ?? [];
  assert.ok(path, `the frontmatter should name the cover:\n${saved}`);
  assert.ok(saved.includes(`](${path})`), 'and it is the image the body points at, not another one');
  assert.equal(uploads(), before + 1, 'one picture, one file on the site');
});

test('a file is attached as it is, and linked from the body', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'sgcms-')), 'Course Guide.pdf');
  writeFileSync(file, '%PDF-1.4 a small pretend PDF\n');

  await page.evaluate(`document.querySelector('#toolbar [data-cmd="attach"]').click()`);
  await page.chooseFile('#file-input', file);
  await page.until(`document.querySelector('#body a[href*="course-guide"]')`, { label: 'the link' });
  const id = await page.evaluate(`new URLSearchParams(location.search).get('id')`);
  await save();

  const saved = gh.files.get(`${CONTENT_DIR}/${id}.md`);
  const [, text, href] = saved.match(/\[([^\]]+)\]\((\/uploads\/[^)]+)\)/) ?? [];
  assert.equal(text, 'Course Guide.pdf', 'the link reads as the file was named');
  assert.match(href, /^\/uploads\/\d{8}\/course-guide-\w{4}\.pdf$/);
  // and the file went in untouched, which is the whole point of attaching rather than uploading
  assert.equal(Buffer.from(gh.files.get(href.replace('/uploads', MEDIA_DIR))).toString(), '%PDF-1.4 a small pretend PDF\n');
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

test('nothing the editor does reaches the network', async () => {
  // Both servers are on 127.0.0.1, and the editor's API is pointed at the fake one. So any other
  // origin in what the page loaded is a leak: a font or an icon from a CDN, an embed in an
  // article that is really being fetched, a stray address left in the code. data: and blob: have
  // no origin of their own and report "null".
  const origins = JSON.parse(
    await page.evaluate(`JSON.stringify([...new Set(performance.getEntriesByType('resource').map((r) => new URL(r.name).origin))])`),
  );
  assert.deepEqual(
    origins.filter((o) => ![site.origin, gh.origin, 'null'].includes(o)),
    [],
    'everything the editor loaded should have come from this machine',
  );
  assert.ok(origins.includes(site.origin) && origins.includes(gh.origin), 'and both local servers were really used');
});

// After the check above, because it reloads the page and that empties the browser's own record
// of the requests made
test('the list is read in two steps, and opening the editor again downloads no articles at all', async () => {
  const listings = gh.queries.filter((q) => q.includes('on Tree'));
  assert.ok(listings.length >= 1, 'the list is read by listing the files first');
  assert.ok(
    listings.every((q) => !q.includes('text')),
    'the listing asks for names and hashes, not for the articles themselves',
  );

  // The bodies are kept in this browser under the hash of their contents, so nothing has to be
  // asked for twice — and nothing can come back as the wrong version of an article
  const before = gh.queries.length;
  await page.navigate(site.origin);
  await page.until(`!document.getElementById('app').hidden`, { label: 'the editor again' });
  await page.until(`document.querySelectorAll('#list .item').length >= 3`, { label: 'the list again' });
  const asked = gh.queries.slice(before);
  assert.deepEqual(
    asked.map((q) => (q.includes('on Tree') ? 'listing' : 'bodies')),
    ['listing'],
    'the second visit is one request, and it is the listing',
  );
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
