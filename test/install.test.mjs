// `simple-git-cms install` leaves config.json alone, so it is also where an upgrade can say that
// the config.json it left alone is one the new version won't open.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { upgradeNotes } from '../scripts/install.mjs';

test('a config.json from before 1.0 is told both things that moved', () => {
  const old = { repo: 'o/r', collection: { dir: 'src/content/news' }, preview: { url: '/news/preview/' } };
  const notes = upgradeNotes(old);
  assert.equal(notes.length, 2);
  assert.match(notes[0], /"collections"/);
  assert.match(notes[1], /"preview"/);
  assert.equal(upgradeNotes({ repo: 'o/r', collection: { dir: 'x' } }).length, 1, 'one without a preview is told only about collection');
});

test('a current config.json, or something that is not one, has nothing to change', () => {
  const example = JSON.parse(readFileSync(new URL('../public/config.example.json', import.meta.url), 'utf8'));
  assert.deepEqual(upgradeNotes(example), []);
  for (const value of [null, 'config', 7, []]) assert.deepEqual(upgradeNotes(value), []);
});
