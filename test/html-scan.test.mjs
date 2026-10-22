// One unclosed tag in one article changes every page it is on, and Markdown's own rules cannot
// see it: they end a block of HTML at the first blank line. These check what does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlProblems } from '../src/html-scan.js';

const kinds = (body) => htmlProblems(body).map((p) => `${p.kind} ${p.tag}:${p.line}`);

test('a body whose HTML closes everything it opens has nothing wrong with it', () => {
  assert.deepEqual(kinds('Text.\n\n<aside class="notice">A.</aside>\n\n<div><p>B.</p></div>'), []);
});

test('a tag that is never closed is named, with the line it is on', () => {
  assert.deepEqual(kinds('Text.\n\n<div style="color: red">aaaaaa\n\nMore of the article.'), ['unclosed div:3']);
});

test('an element opened in one block and closed in another is whole, blank lines and all', () => {
  // Markdown reads this as three things; as HTML it is one, which is the point
  assert.deepEqual(kinds('<div class="box">\n\n**Markdown** in a wrapper.\n\n</div>'), []);
});

test('a closing tag that closes nothing is named too', () => {
  assert.deepEqual(kinds('A paragraph.\n\n</div>'), ['stray div:3']);
});

test('what is inside code is quoting, not markup', () => {
  assert.deepEqual(kinds('Use `<div>` like this:\n\n```html\n<div class="x">\n```\n\nAnd that is all.'), []);
  assert.deepEqual(kinds('~~~\n<section>\n~~~'), []);
});

test('elements that have no closing tag are not waited for', () => {
  assert.deepEqual(kinds('<img src="/a.png">\n\nA<br>B\n\n<hr>\n\n<YouTube id="x" />'), []);
});

test('a < that is not a tag is not a tag', () => {
  assert.deepEqual(kinds('3 < 5, and 10 <20 too.'), []);
});

test('a script is left alone, since what is in it is not markup', () => {
  assert.deepEqual(kinds('<script>\nif (a<b) go();\n</script>'), []);
  assert.deepEqual(kinds('<pre>\n<div>\n</pre>'), []);
});

test('tags are matched whatever their case, and attributes cannot hide a bracket', () => {
  assert.deepEqual(kinds('<DIV data-x="a>b">text</div>'), []);
  assert.deepEqual(kinds('<DIV data-x="a>b">text'), ['unclosed div:1']);
});

test('an element left open inside another is closed with it, the way a browser does', () => {
  assert.deepEqual(kinds('<div><span>text</div>'), [], 'the span ends with the div; nothing escapes');
});
