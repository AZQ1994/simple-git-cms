// The site side of the preview, without a browser: just enough of a window around it to post a
// message in and read back what the page is handed. The body HTML is left empty here — what
// happens to images inside it is covered by the browser tests.
import test from 'node:test';
import assert from 'node:assert/strict';

let listener;
const frameParent = {};
Object.assign(globalThis, {
  location: { origin: 'https://site.example' },
  parent: frameParent,
  window: {}, // a page inside a frame, so not its own parent
  addEventListener: (type, fn) => type === 'message' && (listener = fn),
  document: {
    createElement: (tag) =>
      tag === 'template'
        ? { innerHTML: '', content: { querySelectorAll: () => [] } }
        : { innerHTML: '', append() {} },
  },
});
frameParent.postMessage = () => {};
const { connectPreview } = await import('../integrations/preview-client.js');

const updates = [];
connectPreview((article) => updates.push(article));
const send = (article, images = {}) =>
  listener({ source: frameParent, origin: globalThis.location.origin, data: { type: 'simple-git-cms-preview', article, html: '', images } });

test('a cover not uploaded yet is handed over as an address the page can load', () => {
  const blob = new Blob(['png'], { type: 'image/png' });
  send({ title: 'A', image: '/uploads/20261023/new.webp', fields: { image: '/uploads/20261023/new.webp', author: 'K' } }, { '/uploads/20261023/new.webp': blob });
  const got = updates.at(-1);
  assert.match(got.image, /^blob:/);
  assert.deepEqual(got.fields, { image: '/uploads/20261023/new.webp', author: 'K' }, 'the frontmatter itself is passed on as it is');

  send({ title: 'A', image: '/uploads/20261023/new.webp' }, { '/uploads/20261023/new.webp': blob });
  assert.equal(updates.at(-1).image, got.image, 'the same picture keeps the same address, so it does not flicker');
});

test('a cover already on the site, or none at all, is passed on as it is', () => {
  send({ title: 'B', image: '/uploads/20250101/old.webp' });
  assert.equal(updates.at(-1).image, '/uploads/20250101/old.webp');
  send({ title: 'C', image: null });
  assert.equal(updates.at(-1).image, null);
  send({ title: 'D' }); // from an editor older than this, which sends no image
  assert.equal(updates.at(-1).image, null);
});
