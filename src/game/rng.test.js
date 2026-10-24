import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from './rng.js';

test('same seed gives the same sequence, different seeds differ', () => {
  const a = createRng(42), b = createRng(42), c = createRng(43);
  const sa = Array.from({ length: 10 }, () => a.next());
  const sb = Array.from({ length: 10 }, () => b.next());
  const sc = Array.from({ length: 10 }, () => c.next());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((v) => v >= 0 && v < 1));
});

test('int, pick, chance and shuffle behave', () => {
  const r = createRng(7);
  for (let i = 0; i < 200; i++) {
    const v = r.int(3, 6);
    assert.ok(Number.isInteger(v) && v >= 3 && v <= 6);
  }
  assert.ok([1, 2, 3].includes(r.pick([1, 2, 3])));
  assert.equal(r.chance(0), false);
  assert.equal(r.chance(1), true);
  const arr = [1, 2, 3, 4, 5, 6];
  const sh = r.shuffle(arr);
  assert.deepEqual([...sh].sort(), arr);
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6]); // input untouched
  assert.deepEqual(createRng(5).shuffle(arr), createRng(5).shuffle(arr));
});

test('string seeds are accepted and stable', () => {
  assert.equal(createRng('abc').next(), createRng('abc').next());
});
