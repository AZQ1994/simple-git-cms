import { test } from 'node:test';
import assert from 'node:assert/strict';
import rehypeToc from '../integrations/astro/rehype-toc.mjs';
import { renderMarkdown } from '../src/preview.js';

const el = (tagName, properties = {}, children = []) => ({ type: 'element', tagName, properties, children });
const text = (value) => ({ type: 'text', value });
const h = (level, value, properties = {}) => el(`h${level}`, properties, [text(value)]);
const run = (children, options, frontmatter) => {
  const tree = { type: 'root', children };
  rehypeToc(options)(tree, { data: { astro: { frontmatter } } });
  return tree.children;
};

test('headings get ids like GitHub gives them, Chinese and Japanese included, repeats numbered', () => {
  const out = run([h(2, 'Getting Started!'), h(2, '第一章：开始'), h(3, 'はじめに'), h(2, 'Getting Started')], { insert: false });
  assert.deepEqual(out.map((n) => n.properties.id), ['getting-started', '第一章开始', 'はじめに', 'getting-started-1']);
});

test('an id a heading already has is kept, and not handed out again', () => {
  const out = run([h(2, 'Intro', { id: 'intro' }), h(2, 'Intro')], { insert: false });
  assert.deepEqual(out.map((n) => n.properties.id), ['intro', 'intro-1']);
});

test('the contents go at the top, h3s nested under their h2', () => {
  const [nav] = run([h(2, 'A'), h(3, 'A.1'), h(3, 'A.2'), h(2, 'B')]);
  assert.equal(nav.tagName, 'nav');
  assert.deepEqual(nav.properties.className, ['toc']);
  const [a, b] = nav.children[0].children;
  assert.equal(a.children[0].properties.href, '#a');
  assert.deepEqual(a.children[1].children.map((li) => li.children[0].properties.href), ['#a1', '#a2']);
  assert.equal(b.children.length, 1);
});

test('no contents for a short article, with insert: false, or with toc: false in the frontmatter', () => {
  assert.equal(run([h(2, 'A'), h(2, 'B')])[0].tagName, 'h2');
  assert.equal(run([h(2, 'A'), h(2, 'B'), h(2, 'C')], { insert: false })[0].tagName, 'h2');
  assert.equal(run([h(2, 'A'), h(2, 'B'), h(2, 'C')], {}, { toc: false })[0].tagName, 'h2');
  assert.equal(run([h(2, 'A'), h(2, 'B')], { minHeadings: 2 })[0].tagName, 'nav');
});

test('a title, when given, heads the list and names the nav', () => {
  const [nav] = run([h(2, 'A'), h(2, 'B'), h(2, 'C')], { title: '目录' });
  assert.equal(nav.properties.ariaLabel, '目录');
  assert.equal(nav.children[0].children[0].value, '目录');
});

test('the editor preview has the contents, and leaves them out for toc: false', () => {
  const md = '## 一\n\n正文\n\n## 二\n\n### 二点一\n\n## 三\n';
  const html = renderMarkdown(md);
  assert.match(html, /^<nav class="toc" aria-label="Contents"><ol><li><a href="#一">一<\/a><\/li>/);
  assert.match(html, /<h3 id="二点一">二点一<\/h3>/);
  assert.doesNotMatch(renderMarkdown(md, { toc: false }), /<nav/);
});
