// The countdown across daylight-saving changes. The zone is set before the module loads, so this
// lives in its own file (the other tests run in whatever zone the machine has).
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Australia/Sydney';
const { nextGnome } = await import('../assets/js/daily/countdown.js');

test('the zone really is Sydney', () => {
  assert.equal(new Date(2026, 9, 4, 12).getTimezoneOffset(), -660); // AEDT
  assert.equal(new Date(2026, 3, 5, 12).getTimezoneOffset(), -600); // AEST
});

test('the day DST starts is 23 hours long (4 Oct 2026)', () => {
  const r = nextGnome(new Date(2026, 9, 4, 0, 0, 1), '2026-10-04');
  assert.equal(r.hours, 23);
  assert.equal(r.minutes, 0);
  assert.equal(r.text, 'Next gnome in 23h 0m');
});

test('the day DST ends is 25 hours long (5 Apr 2026)', () => {
  const r = nextGnome(new Date(2026, 3, 5, 0, 0, 1), '2026-04-05');
  assert.equal(r.hours, 25);
  assert.equal(r.minutes, 0);
  assert.equal(r.text, 'Next gnome in 25h 0m');
});

test('late on the DST day it still counts real time', () => {
  assert.equal(nextGnome(new Date(2026, 9, 4, 22, 30), '2026-10-04').text, 'Next gnome in 1h 30m');
  assert.equal(nextGnome(new Date(2026, 3, 5, 22, 30), '2026-04-05').text, 'Next gnome in 1h 30m');
});
