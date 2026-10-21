// The blocks a site defines in config.json: read from the template, written back through it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blocks, fillBlock, fillTemplate, matchBlock, setBlocks } from '../src/blocks.js';

const YOUTUBE = { name: 'youtube', label: 'YouTube', template: '<YouTube id="{id}" />', preview: 'https://i.ytimg.com/vi/{id}/hqdefault.jpg' };
const NOTICE = { name: 'notice', template: ':::notice\n{body}\n:::', fields: [{ name: 'body', label: 'Text', multiline: true }] };
const SHORTCODE = { name: 'video', template: '{{< youtube {id} >}}' };

test('the fields follow from the template', () => {
  setBlocks([YOUTUBE, NOTICE]);
  assert.deepEqual(blocks()[0].fields, [{ name: 'id', label: 'id' }]);
  assert.deepEqual(blocks()[1].fields, [{ name: 'body', label: 'Text', multiline: true }]);
  assert.equal(blocks()[1].label, 'notice', 'a block with no label is called by its name');
});

test('a template recognises what it writes', () => {
  setBlocks([YOUTUBE]);
  const found = matchBlock('<YouTube id="dQw4w9WgXcQ" />');
  assert.deepEqual(found.values, { id: 'dQw4w9WgXcQ' });
  assert.equal(fillBlock(found), '<YouTube id="dQw4w9WgXcQ" />');
});

test('a template that is not HTML at all works the same way', () => {
  setBlocks([SHORTCODE]);
  assert.deepEqual(matchBlock('{{< youtube abc123 >}}').values, { id: 'abc123' });
  assert.equal(fillBlock({ block: 'video', values: { id: 'abc123' } }), '{{< youtube abc123 >}}');
});

test('several lines in one field', () => {
  setBlocks([NOTICE]);
  const found = matchBlock(':::notice\nTwo\nlines\n:::');
  assert.deepEqual(found.values, { body: 'Two\nlines' });
  assert.equal(fillBlock(found), ':::notice\nTwo\nlines\n:::');
});

test('something that only looks similar is not a match', () => {
  setBlocks([YOUTUBE]);
  for (const text of ['<YouTubePlaylist id="x" />', '<YouTube src="x" />', 'See <YouTube id="x" /> above']) {
    assert.equal(matchBlock(text), null, text);
  }
});

test('a block whose definition has gone is written back as it was read', () => {
  setBlocks([YOUTUBE]);
  const found = matchBlock('<YouTube id="abc" />');
  setBlocks([]);
  assert.equal(fillBlock(found), '<YouTube id="abc" />', 'turning a definition off must not delete what it described');
});

test('a preview address is filled in with the values, escaped for a URL', () => {
  assert.equal(fillTemplate('https://i.ytimg.com/vi/{id}/hqdefault.jpg', { id: 'a b' }), 'https://i.ytimg.com/vi/a%20b/hqdefault.jpg');
});

test('definitions that could not work are ignored rather than half-applied', () => {
  setBlocks([{ label: 'no name' }, { name: 'no-template' }, YOUTUBE, null]);
  assert.deepEqual(blocks().map((b) => b.name), ['youtube']);
});
