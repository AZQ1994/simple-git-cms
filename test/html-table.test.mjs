// HTML tables: the ones a pipe table cannot express. Read as tables, written back the same way
// every time — and when there is any doubt, not read as a table at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { needsHtml, parseHtmlTable, writeHtmlTable } from '../src/html-table.js';

const TABLE = `<table>
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

test('a table with a merged header comes back exactly as it went in', () => {
  const node = parseHtmlTable(TABLE);
  assert.equal(node.attrs.format, 'html');
  assert.equal(node.content.length, 2);
  assert.equal(node.content[0].content[1].attrs.colspan, 2);
  assert.equal(node.content[1].content[1].attrs.align, 'right');
  assert.equal(writeHtmlTable(node), TABLE);
});

test('the markup is tidied once and then left alone', () => {
  const ragged = '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
  const tidy = writeHtmlTable(parseHtmlTable(ragged));
  assert.equal(tidy, '<table>\n  <tr>\n    <td>a</td>\n    <td>b</td>\n  </tr>\n</table>');
  assert.equal(writeHtmlTable(parseHtmlTable(tidy)), tidy);
});

test('the formatting a cell is allowed survives', () => {
  const html = '<table>\n  <tr>\n    <td><strong>bold</strong> and <em>italic</em> and <a href="/x">a link</a><br>second line</td>\n  </tr>\n</table>';
  assert.equal(writeHtmlTable(parseHtmlTable(html)), html);
});

test('& < > in a cell stay what they were', () => {
  const html = '<table>\n  <tr>\n    <td>A &amp; B &lt;C&gt;</td>\n  </tr>\n</table>';
  const node = parseHtmlTable(html);
  assert.equal(node.content[0].content[0].content[0].content[0].text, 'A & B <C>');
  assert.equal(writeHtmlTable(node), html);
});

test('anything that could not be written back again is refused, so the raw HTML is kept instead', () => {
  const refused = [
    '<table class="wide"><tr><td>a</td></tr></table>', // an attribute we would drop
    '<table><tr><td><table><tr><td>x</td></tr></table></td></tr></table>', // a table in a table
    '<table><tr><td><p>one</p><p>two</p></td></tr></table>', // two blocks in one cell
    '<table><tr><td><span class="x">y</span></td></tr></table>', // a tag with something to say
    '<table><tr><td style="color: red">y</td></tr></table>', // a style that is not alignment
    '<table><thead class="x"><tr><td>y</td></tr></thead></table>',
    '<table><tr><td>a</td>stray text<td>b</td></tr></table>',
    '<table></table>',
    '<div>not a table</div>',
  ];
  for (const html of refused) assert.equal(parseHtmlTable(html), null, html);
});

test('a table needs HTML exactly when a cell spans more than one', () => {
  assert.equal(needsHtml(parseHtmlTable(TABLE)), true);
  assert.equal(needsHtml(parseHtmlTable('<table><tr><td>a</td></tr></table>')), false);
});
