// The lines a translator has to look at when the source changed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { changesOnly, lineDiff } from '../src/diff.js';

const ops = (d) => d.map((x) => `${x.op}${x.text}`);

test('lines the same in both stay, the rest are removed or added', () => {
  assert.deepEqual(ops(lineDiff('a\nb\nc', 'a\nB\nc\nd')), [' a', '-b', '+B', ' c', '+d']);
  assert.deepEqual(ops(lineDiff('a', 'a')), [' a']);
  assert.deepEqual(ops(lineDiff('', 'x')), ['-', '+x']);
});

test('only the changes are shown, with a line around each', () => {
  const d = lineDiff('1\n2\n3\n4\n5\n6\n7', '1\n2\n3\nfour\n5\n6\n7');
  assert.deepEqual(ops(changesOnly(d)), ['…', ' 3', '-4', '+four', ' 5', '…']);
  assert.deepEqual(ops(changesOnly(lineDiff('a', 'a'))), ['…'], 'nothing changed');
});

test('a text too long to compare line by line is shown whole, before and after', () => {
  const long = Array.from({ length: 3001 }, (_, i) => String(i)).join('\n');
  const d = lineDiff(long, `${long}\nmore`);
  assert.equal(d.filter((x) => x.op === '-').length, 3001);
  assert.equal(d.filter((x) => x.op === '+').length, 3002);
});
