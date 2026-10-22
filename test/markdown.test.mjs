// What the editor writes to the file. The browser tests drive the real editor end to end; these
// go straight at the schema, where every Markdown shape can be checked cheaply — above all that
// opening a file and saving it again leaves it alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownManager } from '@tiptap/markdown';
import { cleanMarkdown, schemaExtensions } from '../src/schema.js';
import { newFilePath } from '../src/images.js';
import { setBlocks } from '../src/blocks.js';

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

test('extra blank lines are one blank line, not an empty paragraph the site would show', () => {
  assert.equal(roundTrip('One.\n\n\n\n&nbsp;\n\nTwo.'), 'One.\n\n&nbsp;\n\nTwo.');
  assert.equal(roundTrip('One.\n\n\n\nTwo.'), 'One.\n\nTwo.');
  assert.equal(roundTrip('- a\n- b\n\n\n\nAfter.'), '- a\n- b\n\nAfter.');
});

test('a loose list stays loose, and keeps the spaces after its markers', () => {
  // what turndown writes, and so what an article imported from elsewhere looks like
  for (const list of [
    '-   one\n\n-   two\n\nAfter.',
    '1.  one\n\n2.  two',
    '-   a\n\n-   b\n    -   c\n    -   d',
    '1.  a\n\n    more\n\n2.  b',
  ]) {
    assert.equal(roundTrip(list), list);
  }
});

test('a tight list stays tight, even with a blank line inside one of its items', () => {
  for (const list of ['- a\n- b', '3. one\n4. two', '- a\n\n  more\n- b', '1. a\n   - c\n   - d\n2. b']) {
    assert.equal(roundTrip(list), list);
  }
});

test('a rule keeps the spelling it was found in', () => {
  for (const body of ['One.\n\n* * *\n\nTwo.', 'One.\n\n---\n\nTwo.', 'One.\n\n___\n\nTwo.']) assert.equal(roundTrip(body), body);
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

// ---------- Attachment names ----------

test('an attachment keeps a name worth reading in the address, and cannot overwrite another', () => {
  const a = newFilePath('入学案内 2026 (最新).PDF');
  const b = newFilePath('入学案内 2026 (最新).PDF');
  assert.match(a, /^\/uploads\/\d{8}\/[a-z0-9-]+-[a-z0-9]{4}\.pdf$/, a);
  assert.notEqual(a, b, 'two files of the same name on the same day are two files');
  assert.match(newFilePath('Course Guide.pdf'), /course-guide-[a-z0-9]{4}\.pdf$/);
  assert.match(newFilePath('no-extension'), /no-extension-[a-z0-9]{4}$/);
  assert.match(newFilePath('.hidden'), /\/hidden-[a-z0-9]{4}$/, 'a name that is all extension is just a name');
});

// ---------- Code ----------

test('a fenced block keeps its language and its contents, angle brackets and all', () => {
  const body = 'Before.\n\n```js\nconst a = 1 < 2;\nconsole.log(a && b);\n```\n\nAfter.';
  assert.equal(roundTrip(body), body);
});

test('inline code survives, in a sentence, a list and a table cell', () => {
  assert.equal(roundTrip('Run `npm test` first.'), 'Run `npm test` first.');
  assert.equal(roundTrip('- a list\n- with `code` in it'), '- a list\n- with `code` in it');
  assert.equal(roundTrip('| a   | b   |\n| --- | --- |\n| `x` | 2   |'), '| a   | b   |\n| --- | --- |\n| `x` | 2   |');
});

test('an entity quoted inside code stays an entity, not the character it stands for', () => {
  // The rule that puts & < > back has to stop at the backticks, or an article about HTML
  // rewrites itself into the HTML it was describing
  for (const body of ['An entity in code: `&lt;div&gt;` and `&amp;`.', '```html\n<div>&lt;escaped&gt;</div>\n```', '<div class="note">Say &lt;p&gt; here.</div>']) {
    assert.equal(roundTrip(body), body);
  }
});

test('an entity inside a fence is quoted on every line of it, not only the first', () => {
  const body = '```html\n<p>&lt;a&gt;</p>\n\nstill &amp;lt; quoted\n```';
  assert.equal(roundTrip(body), body);
});

// ---------- Blocks a site defines for itself ----------

const withBlocks = (list, fn) => {
  setBlocks(list);
  try {
    fn();
  } finally {
    setBlocks([]);
  }
};

test('an element a definition claims is read as a block and written back as that element', () => {
  withBlocks([{ tag: 'YouTube', fields: [{ name: 'id' }] }], () => {
    const body = 'Before.\n\n<YouTube id="dQw4w9WgXcQ" />\n\nAfter.';
    assert.equal(roundTrip(body), body);
  });
});

test('a block with something between its tags', () => {
  withBlocks([{ tag: 'aside', attrs: { class: 'notice' }, fields: [{ name: 'text', from: 'content', multiline: true }] }], () => {
    const body = '<aside class="notice">Applications close on 20 February.</aside>';
    assert.equal(roundTrip(body), body);
  });
});

const NOTICE = [{ tag: 'aside', attrs: { class: 'notice' }, fields: [{ name: 'text', from: 'content', multiline: true }] }];

test('a block written across a blank line is one block, not an open tag and a stray closing one', () => {
  // Markdown ends a block of HTML at the first blank line, so this is what someone writing two
  // paragraphs in a notice gets — and the closing tag used to end up in the text
  withBlocks(NOTICE, () => {
    const body = '<aside class="notice">Rooms are not confirmed.\n\nMore to follow.</aside>';
    const doc = md.parse(body);
    assert.deepEqual(doc.content.map((n) => n.type), ['customBlock']);
    assert.equal(doc.content[0].attrs.values.text, 'Rooms are not confirmed.\n\nMore to follow.');
    assert.equal(roundTrip(body), body);
  });
});

test('what is around such a block is still read as Markdown, and entities in it stay as written', () => {
  withBlocks(NOTICE, () => {
    const body = 'Before.\n\n<aside class="notice">A.\n\n&lt;b&gt; stays.</aside>\n\nAfter.';
    const doc = md.parse(body);
    assert.deepEqual(doc.content.map((n) => n.type), ['paragraph', 'customBlock', 'paragraph']);
    assert.equal(roundTrip(body), body);
  });
});

test('an element that is never closed is left exactly as Markdown reads it', () => {
  withBlocks(NOTICE, () => {
    const body = '<aside class="notice">A.\n\nB.';
    assert.equal(roundTrip(body), body);
  });
});

test('a tag no definition claims keeps Markdown’s rules, and is still written back to the byte', () => {
  // Two blocks, because the blank line says so — but the indentation of the second is not ours to
  // drop, which is what used to happen
  const body = '<table>\n  <tr>\n    <td>a</td>\n  </tr>\n\n  <tr>\n    <td>b</td>\n  </tr>\n</table>';
  assert.equal(roundTrip(body), body);
});

test('an element no definition claims is still plain HTML, and so is everything else', () => {
  withBlocks([{ tag: 'YouTube', fields: [{ name: 'id' }] }], () => {
    const body = 'An ordinary paragraph.\n\n<iframe src="x"></iframe>\n\n```js\nconst a = 1;\n```';
    assert.equal(roundTrip(body), body);
  });
});

// ---------- Tables written as HTML ----------
//
// A pipe table is the plain one, and that is all the table button makes. Everything beyond it —
// a header across two columns — is HTML, which the editor only edits as a table when config.json
// has said so: `{ "tag": "table", "edit": "table" }`.

const TABLE_BLOCK = [{ tag: 'table', label: 'Advanced table', edit: 'table' }];

const HTML_TABLE = `<table>
  <tr>
    <th>Course</th>
    <th colspan="2">Spring</th>
  </tr>
  <tr>
    <td>A1</td>
    <td style="text-align: right">42,000</td>
    <td>April</td>
  </tr>
</table>`;

test('a table written as HTML is read as a table and written back as HTML', () => {
  withBlocks(TABLE_BLOCK, () => {
    const body = `Before.\n\n${HTML_TABLE}\n\nAfter.`;
    assert.equal(roundTrip(body), body);
  });
});

test('without that definition an HTML table is source, and still comes back unchanged', () => {
  const body = `Before.\n\n${HTML_TABLE}\n\nAfter.`;
  assert.equal(roundTrip(body), body);
});

test('a pipe table with a merged cell becomes HTML, because pipes cannot say it', () => {
  const pipes = '| a   | b   |\n| --- | --- |\n| 1   | 2   |';
  const doc = md.parse(pipes);
  doc.content[0].content[1].content[0].attrs = { colspan: 2, rowspan: 1, align: null };
  assert.match(cleanMarkdown(md.serialize(doc)), /^<table>/, 'the file has to say what the table now is');
});

test('an HTML table the editor could not write back stays raw HTML', () => {
  withBlocks(TABLE_BLOCK, () => {
    const body = '<table class="wide"><tr><td>a</td></tr></table>';
    assert.equal(roundTrip(body), body);
  });
});
