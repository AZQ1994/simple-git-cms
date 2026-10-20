import { test } from 'node:test';
import assert from 'node:assert/strict';
import rehypeFigures from '../integrations/astro/rehype-figures.mjs';

const el = (tagName, properties = {}, children = []) => ({ type: 'element', tagName, properties, children });
const text = (value) => ({ type: 'text', value });
const run = (children) => {
  const tree = { type: 'root', children };
  rehypeFigures()(tree);
  return tree.children;
};

test('单张带说明 → figure + figcaption', () => {
  const [f] = run([el('p', {}, [el('img', { src: '/a.webp', title: '说明' })])]);
  assert.equal(f.tagName, 'figure');
  assert.equal(f.children[0].properties.title, undefined);
  assert.equal(f.children[1].children[0].value, '说明');
});

test('同一段多张 → gallery', () => {
  const [g] = run([el('p', {}, [el('img', { src: '/a' }), text('\n'), el('img', { src: '/b' })])]);
  assert.deepEqual(g.properties.className, ['gallery', 'cols-2']);
  assert.equal(g.children.length, 2);
});

test('单张无说明、只有空白的段落（&nbsp;）、图文混排 → 原样保留', () => {
  const out = run([el('p', {}, [el('img', { src: '/a' })]), el('p', {}, [text(' ')]), el('p', {}, [text('文字'), el('img', { src: '/b' })])]);
  assert.deepEqual(out.map((n) => n.tagName), ['p', 'p', 'p']);
});
