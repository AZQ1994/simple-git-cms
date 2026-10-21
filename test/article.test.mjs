import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArticle, serializeArticle } from '../src/article.js';

const sample = `---
title: "东京语言学校校外活动｜参观"
description: "摘要"
date: 2026-10-13T07:01:58.000Z
tags: ["校外活动", "校园生活"]
legacy:
  pc: 90
  mobile: 91
---

正文第一段。

![](/uploads/a.webp "说明")
`;

test('parsing and writing back leaves the file byte-for-byte identical, unknown fields included', () => {
  const a = parseArticle('90', sample);
  assert.equal(a.title, '东京语言学校校外活动｜参观');
  assert.deepEqual(a.tags, ['校外活动', '校园生活']);
  assert.deepEqual(a.extra, { legacy: { pc: 90, mobile: 91 } });
  assert.equal(serializeArticle(a), sample);
});

test('the draft flag, and a summary generated from the body', () => {
  const a = parseArticle('1', '---\ntitle: "T"\ndate: 2026-01-01\ntags: []\n---\n\n![](/x.webp)\n\n**很长**的正文\n');
  const out = serializeArticle({ ...a, draft: true, description: '' });
  assert.match(out, /^draft: true$/m);
  assert.match(out, /^description: "很长的正文"$/m);
});

test('quotes and colons in a title do not break the YAML', () => {
  const a = parseArticle('2', serializeArticle({ id: '2', title: '他说："你好: 世界"', description: '', date: '2026-01-01T00:00:00Z', tags: ['a'], draft: false, extra: {}, body: 'x' }));
  assert.equal(a.title, '他说："你好: 世界"');
});
