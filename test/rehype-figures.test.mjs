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

test('one image with a caption becomes figure + figcaption', () => {
  const [f] = run([el('p', {}, [el('img', { src: '/a.webp', title: '说明' })])]);
  assert.equal(f.tagName, 'figure');
  assert.equal(f.children[0].properties.title, undefined);
  assert.equal(f.children[1].children[0].value, '说明');
});

test('several images in a paragraph become a gallery', () => {
  const [g] = run([el('p', {}, [el('img', { src: '/a' }), text('\n'), el('img', { src: '/b' })])]);
  assert.deepEqual(g.properties.className, ['gallery', 'cols-2']);
  assert.equal(g.children.length, 2);
});

test('an uncaptioned image, a whitespace-only paragraph (&nbsp;), and mixed text and images are all left alone', () => {
  const out = run([el('p', {}, [el('img', { src: '/a' })]), el('p', {}, [text(' ')]), el('p', {}, [text('文字'), el('img', { src: '/b' })])]);
  assert.deepEqual(out.map((n) => n.tagName), ['p', 'p', 'p']);
});

test('a captioned image without alt text is described by its caption; alt text of its own is kept', () => {
  const [f] = run([el('p', {}, [el('img', { src: '/a.webp', alt: '', title: '说明' })])]);
  assert.equal(f.children[0].properties.alt, '说明');
  const [g] = run([el('p', {}, [el('img', { src: '/a.webp', alt: '一只猫', title: '说明' })])]);
  assert.equal(g.children[0].properties.alt, '一只猫');
});
