import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextGnome, msToNextMinute } from '../assets/js/daily/countdown.js';

const at = (h, m, s = 0, day = 27) => new Date(2026, 9, day, h, m, s);

test('counts to local midnight in hours and minutes', () => {
  const r = nextGnome(at(18, 48), '2026-10-27');
  assert.equal(r.newDay, false);
  assert.equal(r.hours, 5);
  assert.equal(r.minutes, 12);
  assert.equal(r.text, 'Next gnome in 5h 12m');
});

test('partial minutes round up so it never shows 0m early', () => {
  assert.equal(nextGnome(at(23, 58, 30), '2026-10-27').text, 'Next gnome in 2m');
  assert.equal(nextGnome(at(23, 59, 59), '2026-10-27').text, 'Next gnome in 1m');
});

test('under an hour drops the hours; on the hour shows 0m', () => {
  assert.equal(nextGnome(at(23, 5), '2026-10-27').text, 'Next gnome in 55m');
  assert.equal(nextGnome(at(22, 0), '2026-10-27').text, 'Next gnome in 2h 0m');
});

test('just after midnight of the same day it is a long wait', () => {
  assert.equal(nextGnome(at(0, 0, 1), '2026-10-27').text, 'Next gnome in 24h 0m');
});

test('once the local date has moved on, a new gnome is here', () => {
  const r = nextGnome(at(0, 0, 0, 28), '2026-10-27');
  assert.equal(r.newDay, true);
  assert.equal(r.text, 'A new gnome is here');
});

test('crossing a month end', () => {
  const r = nextGnome(new Date(2026, 9, 31, 23, 0), '2026-10-31');
  assert.equal(r.text, 'Next gnome in 1h 0m');
});

test('msToNextMinute is within (0, 60000]', () => {
  assert.equal(msToNextMinute(at(10, 0, 0)), 60000);
  assert.equal(msToNextMinute(new Date(2026, 9, 27, 10, 0, 45, 500)), 14500);
});
