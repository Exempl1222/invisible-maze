import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from './level.js';
import { SPEC_LEVEL, makeLevel } from './fixtures.test.js';

test('parses the spec example', () => {
  const lv = parseLevel(SPEC_LEVEL);
  assert.equal(lv.size, 9);
  assert.deepEqual(lv.start, [2, 2]);
  assert.deepEqual(lv.beacon, [8, 7]);
  assert.equal(lv.moveLimit, 13);
  assert.equal(lv.wallBudget, 4);
  assert.deepEqual(lv.partner(0, 8), [8, 8]);
  assert.deepEqual(lv.partner(8, 8), [0, 8]);
  assert.equal(lv.partner(0, 0), null);
  assert.equal(lv.id, 'd-2026-10-24');
});

test('tile classification', () => {
  const lv = parseLevel(SPEC_LEVEL);
  assert.equal(lv.tile(0, 0), '.');
  assert.equal(lv.tile(5, 0), '=');
  assert.equal(lv.buildable(0, 0), true);
  for (const [x, y] of [[5, 0], [6, 0], [3, 4], [0, 8], [2, 2], [8, 7]]) {
    assert.equal(lv.buildable(x, y), false, `${x},${y}`);
  }
  assert.equal(lv.walkable(6, 0), false); // river
  assert.equal(lv.walkable(3, 4), false); // rock
  assert.equal(lv.walkable(5, 0), true); // bridge
  assert.equal(lv.walkable(0, 8), true); // teleporter
  assert.equal(lv.walkable(-1, 0), false);
  assert.equal(lv.walkable(9, 0), false);
});

test('rejects bad levels with clear errors', () => {
  const ok = ['R.', '.B'];
  assert.doesNotThrow(() => parseLevel(makeLevel(ok)));
  assert.throws(() => parseLevel(makeLevel(['R..', '.B.'], { size: 3 })), /row/i);
  assert.throws(() => parseLevel(makeLevel(['R.', '.B'], { size: 3 })), /size/i);
  assert.throws(() => parseLevel(makeLevel(['R.', '..'])), /beacon/i);
  assert.throws(() => parseLevel(makeLevel(['..', '.B'])), /robot|start/i);
  assert.throws(() => parseLevel(makeLevel(['RR', '.B'])), /robot|start/i);
  assert.throws(() => parseLevel(makeLevel(['RB', '.B'])), /beacon/i);
  assert.throws(() => parseLevel(makeLevel(['Ra', '.B'])), /teleporter.*a/i);
  assert.throws(() => parseLevel(makeLevel(['R?', '.B'])), /unknown tile/i);
  assert.throws(() => parseLevel(makeLevel(['RX', '.B'])), /unknown tile/i);
  assert.throws(() => parseLevel(makeLevel(ok, { moveLimit: 0 })), /moveLimit/);
  assert.throws(() => parseLevel(makeLevel(ok, { wallBudget: -1 })), /wallBudget/);
  assert.throws(() => parseLevel(null), /level/i);
});

test('teleporter letters appearing twice are paired, three times are rejected', () => {
  assert.doesNotThrow(() => parseLevel(makeLevel(['Ra.', '...', 'a.B'])));
  assert.throws(() => parseLevel(makeLevel(['Raa', 'a..', '..B'])), /teleporter.*a/i);
});
