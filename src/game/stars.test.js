import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stars } from './stars.js';

test('3 stars at par', () => assert.equal(stars(3, 3, 5), 3));
test('3 stars even if fewer walls than par were used (cannot win, but never penalise)', () => assert.equal(stars(3, 2, 5), 3));
test('2 stars at par + 1', () => assert.equal(stars(3, 4, 5), 2));
test('1 star at par + 2 within budget', () => assert.equal(stars(3, 5, 6), 1));
test('1 star when budget is exactly par + 2 and all used', () => assert.equal(stars(2, 4, 4), 1));
test('par + 1 at the budget limit is still 2 stars', () => assert.equal(stars(2, 3, 3), 2));
test('over budget scores 0', () => assert.equal(stars(2, 4, 3), 0));
test('rejects non-integer input', () => {
  assert.throws(() => stars(2.5, 3, 4));
  assert.throws(() => stars(2, '3', 4));
  assert.throws(() => stars(2, -1, 4));
});
