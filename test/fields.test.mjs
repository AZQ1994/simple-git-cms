// What a collection's own fields read from the file and write back. The form itself is driven in
// test/e2e/editor.test.mjs; this is the part that decides what lands in the frontmatter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, display, fieldOptions, fits, fromInput, missingFields, toInput } from '../src/fields.js';
import { parseArticle, serializeArticle } from '../src/article.js';

const venue = { name: 'venue', label: 'Venue', required: true };
const seats = { name: 'seats', type: 'number', unit: 'people' };
const status = { name: 'status', type: 'select', options: [{ value: 'open', label: 'Open' }, 'full', 3] };
const online = { name: 'online', label: 'Online', type: 'boolean', required: true };
const starts = { name: 'starts', type: 'date', required: true };

test('options can be values, or values with a label of their own', () => {
  assert.deepEqual(fieldOptions(status), [
    { value: 'open', label: 'Open' },
    { value: 'full', label: 'full' },
    { value: 3, label: '3' },
  ]);
});

test('each type writes back what its input says, and an empty input leaves the field out', () => {
  assert.equal(fromInput(venue, '  Main hall '), 'Main hall');
  assert.equal(fromInput(venue, '   '), undefined);
  assert.equal(fromInput({ name: 'a', multiline: true }, 'line one\nline two\n\n'), 'line one\nline two');
  assert.equal(fromInput(seats, '120'), 120);
  assert.equal(fromInput(seats, '1.5'), 1.5);
  assert.equal(fromInput(seats, ''), undefined);
  assert.equal(fromInput(status, 'open'), 'open');
  assert.equal(fromInput(status, '3'), 3, 'a number among the options is a number in the file');
  assert.equal(fromInput(status, ''), undefined);
  assert.equal(fromInput(status, 'closed'), 'closed', 'a value from the file that is not in the list goes back as it came');
  assert.equal(fromInput(online, true), true);
  assert.equal(fromInput(online, false), undefined);
  assert.equal(fromInput(starts, '2026-11-15'), '2026-11-15');
  assert.equal(fromInput(starts, ''), undefined);
});

test('the input shows what the file says, and nothing for what it could not show', () => {
  assert.equal(toInput(seats, 120), '120');
  assert.equal(toInput(seats, undefined), '');
  assert.equal(toInput(status, 3), '3');
  assert.equal(toInput(online, true), true);
  assert.equal(toInput(online, 'yes'), false);
  assert.equal(toInput(venue, { room: 2 }), '');
});

test('a value fits a field only when its input would write the same thing back', () => {
  assert.ok(fits(seats, 120));
  assert.ok(!fits(seats, '120'));
  assert.ok(!fits(seats, Number.NaN));
  assert.ok(fits(status, 3));
  assert.ok(!fits(status, '3'));
  assert.ok(!fits(status, 'closed'));
  assert.ok(fits(starts, '2026-11-15'));
  assert.ok(!fits(starts, '2026-11-15T10:00:00Z'));
  assert.ok(fits(online, false));
  assert.ok(!fits(online, 'false'));
  assert.ok(!fits(venue, ['a', 'b']));
});

test('publishing needs the required fields; a ticked or unticked box always counts', () => {
  assert.deepEqual(missingFields([venue, seats, online, starts], { seats: 10 }).map((f) => f.name), ['venue', 'starts']);
  assert.deepEqual(missingFields([venue, starts], { venue: 'Hall', starts: '2026-11-15' }), []);
  assert.deepEqual(missingFields([venue], { venue: '' }).map((f) => f.name), ['venue']);
});

test('a new article starts with the defaults, and nothing for a field without one', () => {
  assert.deepEqual(defaults([venue, { ...seats, default: 30 }, { ...status, default: 'open' }, { ...online, default: false }]), { seats: 30, status: 'open', online: false });
});

test('the list shows a choice by its label, a ticked box by its name, a number with its unit', () => {
  assert.equal(display(status, 'open'), 'Open');
  assert.equal(display(status, 'closed'), 'closed');
  assert.equal(display(online, true), 'Online');
  assert.equal(display(online, false), '');
  assert.equal(display(seats, 120), '120 people');
  assert.equal(display(venue, undefined), '');
  assert.equal(display(venue, { a: 1 }), '');
});

test('fields go in the frontmatter as the types they are, and come back out the same', () => {
  const file = `---
title: "Open day"
description: "Come and see"
date: 2026-11-01T12:00:00.000Z
tags: []
venue: Main hall
seats: 120
status: open
online: false
starts: 2026-11-15
---

Body.
`;
  const a = parseArticle('1', file);
  assert.deepEqual(a.extra, { venue: 'Main hall', seats: 120, status: 'open', online: false, starts: '2026-11-15' });
  assert.equal(serializeArticle(a), file, 'opened and saved, unchanged');
  // Changing one keeps its place; a new one goes at the end; an emptied one is gone
  const extra = { ...a.extra, seats: 80, access: 'Two minutes from the station' };
  delete extra.online;
  assert.equal(
    serializeArticle({ ...a, extra }),
    file.replace('seats: 120', 'seats: 80').replace('online: false\n', '').replace('starts: 2026-11-15\n', 'starts: 2026-11-15\naccess: Two minutes from the station\n'),
  );
});
