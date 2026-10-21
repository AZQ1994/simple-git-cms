// What the editor writes to the file. The browser tests drive the real editor end to end; these
// go straight at the schema, where every Markdown shape can be checked cheaply — above all that
// opening a file and saving it again leaves it alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownManager } from '@tiptap/markdown';
import { cleanMarkdown, schemaExtensions } from '../src/schema.js';

const md = new MarkdownManager({ extensions: schemaExtensions });
/** A file through the editor and back out again. */
const roundTrip = (text) => cleanMarkdown(md.serialize(md.parse(text)));

const table = `| Name | Price |  Note   |
| :--- | ----: | :-----: |
| Tea  |   300 |   hot   |
| Cake |  1200 | **new** |
`;

test('a table survives being opened and saved', () => {
  assert.equal(roundTrip(table), table.trimEnd());
});

test('a table keeps its place among the paragraphs around it', () => {
  const body = `Before the table.\n\n${table}\nAfter the table.`;
  assert.equal(roundTrip(body), body.trimEnd());
});

test('a hand-written table is tidied up, and then left alone', () => {
  const ragged = `|Name|Price|Note|\n|:-|-:|:-:|\n|Tea|300|hot|\n|Cake|1200|**new**|\n`;
  const tidy = roundTrip(ragged);
  assert.equal(
    tidy,
    `| Name | Price |  Note   |
| :--- | ----: | :-----: |
| Tea  |   300 |   hot   |
| Cake |  1200 | **new** |`,
  );
  assert.equal(roundTrip(tidy), tidy, 'saving a second time must change nothing');
});

test('columns of Japanese text line up, which counting characters would not manage', () => {
  const out = roundTrip(`| 科目 | 時間 |\n| --- | --- |\n| 日本語 | 9:00 |\n`);
  assert.equal(out.split('\n')[0], '| 科目   | 時間 |', 'the header is padded to the width of 日本語');
  assert.equal(out.split('\n')[2], '| 日本語 | 9:00 |');
  assert.equal(roundTrip(out), out);
});

test('an empty cell is empty, not a non-breaking space', () => {
  const out = roundTrip(`| a | b |\n| --- | --- |\n|  | 2 |\n`);
  assert.doesNotMatch(out, /nbsp/);
  assert.match(out, /^\| {5}\| 2 {3}\|$/m);
});

test('a pipe inside a cell is escaped so the row still has the same columns', () => {
  const out = roundTrip(`| a | b |\n| --- | --- |\n| x \\| y | 2 |\n`);
  assert.match(out, /x \\\| y/);
  assert.equal(roundTrip(out), out);
});

test('the blank lines a writer leaves between paragraphs are kept', () => {
  const body = 'One.\n\n&nbsp;\n\nTwo.';
  assert.equal(roundTrip(body), body);
});

test('an article with no table is written exactly as it was', () => {
  const body = `A first paragraph.

## A heading

- one
- two

> quoted

A [link](https://example.com) and **bold** and *italic*.`;
  assert.equal(roundTrip(body), body);
});

// ---------- Raw HTML ----------

const EMBED = '<iframe src="https://www.youtube.com/embed/abc" width="560" height="315" allowfullscreen></iframe>';

test('HTML the editor has no node for is kept, not dropped', () => {
  const body = `Before.\n\n${EMBED}\n\nAfter.`;
  assert.equal(roundTrip(body), body);
});

test('a multi-line block, a component and a comment all survive', () => {
  for (const html of ['<div class="note">\n  <p>Two lines</p>\n</div>', '<YouTube id="abc123" />', '<!-- more -->']) {
    assert.equal(roundTrip(`A.\n\n${html}\n\nB.`), `A.\n\n${html}\n\nB.`);
  }
});

test('what is typed between the angle brackets is what the file keeps', () => {
  // These went in as &lt; and &gt; before, which the site then showed literally
  for (const body of ['A line with a <br> inside it.', '{{< youtube abc123 >}}', 'Sizes: S < M < L.']) {
    assert.equal(roundTrip(body), body);
  }
});

test('an & that spells out an entity is still spelled out', () => {
  const body = 'An ampersand & and an escaped &amp;lt; entity.';
  assert.equal(roundTrip(body), body);
});
