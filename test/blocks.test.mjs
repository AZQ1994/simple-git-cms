// The blocks a site defines in config.json. Markdown plus HTML: a block is a tag, and a tag no
// definition claims stays plain HTML.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blockFields, blocks, claimFor, emptyElement, fillBlock, fillTemplate, matchBlock, readElement, setBlocks, tableBlock, wholeElement } from '../src/blocks.js';

const YOUTUBE = { tag: 'YouTube', label: 'YouTube', fields: [{ name: 'id', label: 'Video ID' }], preview: 'https://i.ytimg.com/vi/{id}/hqdefault.jpg' };
const NOTICE = { tag: 'aside', name: 'notice', attrs: { class: 'notice' }, fields: [{ name: 'text', from: 'content', multiline: true }] };

test('a tag with attributes', () => {
  setBlocks([YOUTUBE]);
  const found = matchBlock('<YouTube id="dQw4w9WgXcQ" />');
  assert.deepEqual(found.values, { id: 'dQw4w9WgXcQ' });
  assert.equal(fillBlock(found), '<YouTube id="dQw4w9WgXcQ" />');
});

test('a tag with something between its tags', () => {
  setBlocks([NOTICE]);
  const found = matchBlock('<aside class="notice">Applications close on 20 February.</aside>');
  assert.deepEqual(found.values, { class: 'notice', text: 'Applications close on 20 February.' });
  assert.equal(fillBlock(found), '<aside class="notice">Applications close on 20 February.</aside>');
});

test('the attributes a definition insists on are what tells two blocks of the same tag apart', () => {
  setBlocks([NOTICE]);
  assert.equal(matchBlock('<aside class="warning">x</aside>'), null, 'another kind of aside is not this block');
  assert.equal(matchBlock('<aside>x</aside>'), null);
});

test('a tag nobody claims is left to be edited as plain HTML', () => {
  setBlocks([YOUTUBE]);
  for (const html of ['<Vimeo id="x" />', '<div class="box">x</div>', '<YouTube id="a" /><YouTube id="b" />', 'text <YouTube id="a" />']) {
    assert.equal(matchBlock(html), null, html);
  }
});

test('an element saying something the form could not hold stays plain HTML', () => {
  setBlocks([YOUTUBE]); // no content field
  assert.equal(matchBlock('<YouTube id="a">a caption</YouTube>'), null, 'the caption would have nowhere to go');
});

test('an attribute the definition never mentioned is kept, and offered as a field', () => {
  setBlocks([YOUTUBE]);
  const found = matchBlock('<YouTube id="abc" start="30" />');
  assert.deepEqual(found.values, { id: 'abc', start: '30' });
  assert.deepEqual(blockFields(blocks()[0], found.values), [
    { name: 'id', label: 'Video ID', declared: true },
    { name: 'start', label: 'start', declared: false }, // shown, but folded away with the rest
  ]);
  assert.equal(fillBlock(found), '<YouTube id="abc" start="30" />');
});

test('an empty field is left out of the markup rather than written as an empty attribute', () => {
  setBlocks([YOUTUBE]);
  assert.equal(fillBlock({ block: 'YouTube', values: { id: 'abc', start: '' } }), '<YouTube id="abc" />');
});

test('quotes and angle brackets in a value cannot break out of the attribute', () => {
  setBlocks([YOUTUBE]);
  const written = fillBlock({ block: 'YouTube', values: { id: 'a"<b' } });
  assert.equal(written, '<YouTube id="a&quot;&lt;b" />');
  assert.deepEqual(matchBlock(written).values, { id: 'a"<b' }, 'and it reads back as what it was');
});

test('a block whose definition has gone is written back as it was read', () => {
  setBlocks([YOUTUBE]);
  const found = matchBlock('<YouTube id="abc" />');
  setBlocks([]);
  assert.equal(fillBlock(found), '<YouTube id="abc" />', 'turning a definition off must not delete what it described');
});

test('reading one element apart from everything else', () => {
  assert.deepEqual(readElement('<b class="x">hi</b>'), { tag: 'b', attrs: { class: 'x' }, content: 'hi', shape: { selfClosed: false, bare: [] } });
  assert.deepEqual(readElement('<br />'), { tag: 'br', attrs: {}, content: null, shape: { selfClosed: true, bare: [] } });
  assert.deepEqual(readElement('<video controls>x</video>').shape, { selfClosed: false, bare: ['controls'] });
  assert.equal(readElement('<p>a</p><p>b</p>'), null);
  assert.equal(readElement('not html'), null);
});

test('a preview address is filled in with the values, escaped for a URL', () => {
  assert.equal(fillTemplate('https://i.ytimg.com/vi/{id}/hqdefault.jpg', { id: 'a b' }), 'https://i.ytimg.com/vi/a%20b/hqdefault.jpg');
});

test('definitions that could not work are ignored rather than half-applied', () => {
  setBlocks([{ label: 'no tag' }, { tag: '1bad' }, YOUTUBE, null]);
  assert.deepEqual(blocks().map((b) => b.name), ['YouTube']);
});

// ---------- How a block is edited ----------

const TABLE = { tag: 'table', label: 'Advanced table', edit: 'table' };
const GALLERY = { tag: 'div', name: 'gallery', label: 'Gallery', edit: 'source', attrs: { class: 'gallery' } };

test('a definition that says nothing about it is a form', () => {
  setBlocks([YOUTUBE, TABLE, GALLERY, { tag: 'X', edit: 'nonsense' }]);
  assert.deepEqual(blocks().map((b) => b.edit), ['fields', 'table', 'source', 'fields']);
});

test('the definition that claims an element is found by tag, whatever it then does with it', () => {
  setBlocks([TABLE, GALLERY]);
  assert.equal(claimFor('<table><tr><td>a</td></tr></table>').label, 'Advanced table');
  assert.equal(claimFor('<div class="gallery"></div>').label, 'Gallery');
  assert.equal(claimFor('<div class="other"></div>'), null, 'the attributes still have to agree');
  assert.equal(claimFor('<section>x</section>'), null);
});

test('only a block edited as a form is read as one — the others are their own markup', () => {
  setBlocks([TABLE, GALLERY]);
  assert.equal(matchBlock('<table><tr><td>a</td></tr></table>'), null, 'a table is edited as a table');
  assert.equal(matchBlock('<div class="gallery">anything at all</div>'), null, 'a gallery is edited as source');
});

test('the table editor is offered only when the site has said tables may be written that way', () => {
  setBlocks([YOUTUBE]);
  assert.equal(tableBlock(), undefined);
  setBlocks([YOUTUBE, TABLE]);
  assert.equal(tableBlock().label, 'Advanced table');
});

test('inserting a block edited as source starts from the element it describes', () => {
  setBlocks([GALLERY]);
  assert.equal(emptyElement(blocks()[0]), '<div class="gallery"></div>');
});

test('a declared element written across blank lines is measured to its closing tag', () => {
  setBlocks([NOTICE]);
  assert.equal(wholeElement('<aside class="notice">A.\n\nB.</aside>\n\nAfter.'), '<aside class="notice">A.\n\nB.</aside>');
  assert.equal(wholeElement('<aside class="notice">A.\n\nB.</aside><aside class="notice">C.</aside>'), '<aside class="notice">A.\n\nB.</aside>', 'the first closing tag ends it');
  assert.equal(wholeElement('<aside class="notice">A.</aside>'), null, 'with no blank line in it, Markdown already reads it whole');
  assert.equal(wholeElement('<aside class="notice">A.\n\nB.'), null, 'and an element that never closes is not one');
  assert.equal(wholeElement('<div class="x">A.\n\nB.</div>'), null, 'a tag nobody declared keeps Markdown’s rules');
});

// ---------- How the element is written back ----------
//
// `<iframe />` is not `<iframe></iframe>`: HTML has no self-closing elements of its own, so the
// first is an opening tag and everything after it ends up inside it.

const VIDEO = { tag: 'iframe', label: 'Video', fields: [{ name: 'src', label: 'Address' }] };

test('an element goes back in the shape the file wrote it in', () => {
  setBlocks([VIDEO, YOUTUBE]);
  for (const html of [
    '<iframe src="https://www.youtube.com/embed/abc" width="560" height="315" allowfullscreen></iframe>',
    '<YouTube id="abc" />',
    '<YouTube id="abc"></YouTube>',
  ]) {
    assert.equal(fillBlock(matchBlock(html)), html, html);
  }
});

test('an attribute written without a value keeps being written without one', () => {
  setBlocks([VIDEO]);
  const found = matchBlock('<iframe src="x" allowfullscreen></iframe>');
  assert.equal(found.values.allowfullscreen, '', 'it is there, and says nothing');
  assert.equal(fillBlock(found), '<iframe src="x" allowfullscreen></iframe>', 'and it is not dropped as an empty field');
});

test('editing a field leaves the rest of the element exactly as it was', () => {
  setBlocks([VIDEO]);
  const found = matchBlock('<iframe src="x" width="560" allowfullscreen></iframe>');
  assert.equal(fillBlock({ ...found, values: { ...found.values, src: 'y' } }), '<iframe src="y" width="560" allowfullscreen></iframe>');
});

test('a block inserted fresh is written the way its tag is written', () => {
  setBlocks([VIDEO, YOUTUBE, { tag: 'aside', attrs: { class: 'notice' }, fields: [{ name: 'text', from: 'content' }] }]);
  assert.equal(fillBlock({ block: 'iframe', values: { src: 'x' } }), '<iframe src="x"></iframe>', 'HTML closes its elements');
  assert.equal(fillBlock({ block: 'YouTube', values: { id: 'x' } }), '<YouTube id="x" />', 'a component is self-closing');
  assert.equal(fillBlock({ block: 'aside', values: { text: 'hi' } }), '<aside class="notice">hi</aside>');
  assert.equal(emptyElement(blocks()[0]), '<iframe></iframe>');
});

test('an iframe is a video, a map or a form, and the address is what says which', () => {
  const video = { tag: 'iframe', name: 'video', label: 'Video', starts: { src: 'https://www.youtube.com/embed/' }, fields: [{ name: 'src' }] };
  const embed = { tag: 'iframe', name: 'embed', label: 'Embed', fields: [{ name: 'src' }] };
  setBlocks([video, embed]);

  assert.equal(claimFor('<iframe src="https://www.youtube.com/embed/abc"></iframe>').name, 'video');
  assert.equal(claimFor('<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>').name, 'embed', 'the next definition in line gets it');

  setBlocks([video]);
  assert.equal(claimFor('<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>'), null, 'and with nothing else to claim it, it stays plain HTML');
  assert.equal(matchBlock('<iframe src="https://www.youtube.com/embed/abc"></iframe>').block, 'video');
});

test('what a definition insists on the beginning of is a condition, not something it writes', () => {
  setBlocks([{ tag: 'iframe', starts: { src: 'https://www.youtube.com/embed/' }, fields: [{ name: 'src' }] }]);
  assert.equal(fillBlock({ block: 'iframe', values: { src: 'https://www.youtube.com/embed/abc' } }), '<iframe src="https://www.youtube.com/embed/abc"></iframe>');
  assert.equal(fillBlock({ block: 'iframe', values: {} }), '<iframe></iframe>', 'an empty one says nothing on its own');
});
