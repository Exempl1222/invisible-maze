import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDateString, parseDate, dayIndex, formatDaily } from '../assets/js/play/daily.js';

test('localDateString uses the local calendar, padded', () => {
  assert.equal(localDateString(new Date(2026, 9, 7, 23, 59)), '2026-10-07');
  assert.equal(localDateString(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
});
test('parseDate rejects things that are not real dates', () => {
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('2026-1-5'), null);
  assert.equal(parseDate('tomorrow'), null);
  assert.equal(parseDate(null), null);
  assert.notEqual(parseDate('2028-02-29'), null);
});
test('dayIndex counts days from the start, across month ends and clock changes', () => {
  assert.equal(dayIndex('2026-10-27', '2026-10-27'), 0);
  assert.equal(dayIndex('2026-10-27', '2026-10-28'), 1);
  assert.equal(dayIndex('2026-10-27', '2026-11-01'), 5);
  assert.equal(dayIndex('2026-10-27', '2027-04-24'), 179); // across both DST changes
  assert.equal(dayIndex('2026-10-27', '2026-10-26'), -1);
  assert.equal(dayIndex('2026-10-27', 'nope'), null);
});
test('formatDaily', () => {
  assert.equal(formatDaily('2026-10-27'), 'Tue 27 Oct');
  assert.equal(formatDaily('2026-11-01'), 'Sun 1 Nov');
});
