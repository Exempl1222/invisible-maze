import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel, buildableLines } from './level.js';
import { SPEC_LEVEL, makeLevel } from './fixtures.test.js';

test('parses the spec example', () => {
  const lv = parseLevel(SPEC_LEVEL);
  assert.equal(lv.size, 7);
  assert.deepEqual(lv.start, [2, 1]);
  assert.deepEqual(lv.beacon, [4, 5]);
  assert.equal(lv.moveLimit, 9);
  assert.equal(lv.wallBudget, 4);
  assert.deepEqual(lv.partner(0, 4), [6, 6]);
  assert.deepEqual(lv.partner(6, 6), [0, 4]);
  assert.equal(lv.partner(0, 0), null);
  assert.equal(lv.id, 'p01-06');
});

test('tile classification: walkable', () => {
  const lv = parseLevel(SPEC_LEVEL);
  assert.equal(lv.tile(0, 0), '.');
  assert.equal(lv.tile(2, 3), '=');
  assert.equal(lv.walkable(0, 3), false); // river
  assert.equal(lv.walkable(3, 2), false); // rock
  assert.equal(lv.walkable(2, 3), true); // bridge
  assert.equal(lv.walkable(0, 4), true); // teleporter
  assert.equal(lv.walkable(-1, 0), false);
  assert.equal(lv.walkable(7, 0), false);
  assert.equal(lv.buildable, undefined, 'tile walls are gone');
});

test('lineBuildable: grass beside grass only, never the border', () => {
  const lv = parseLevel(SPEC_LEVEL);
  assert.equal(lv.lineBuildable(0, 0, 'R'), true);
  assert.equal(lv.lineBuildable(0, 0, 'D'), true);
  assert.equal(lv.lineBuildable(6, 0, 'R'), false); // right border
  assert.equal(lv.lineBuildable(0, 6, 'D'), false); // bottom border
  assert.equal(lv.lineBuildable(-1, 0, 'R'), false);
  assert.equal(lv.lineBuildable(0, 0, 'L'), false);
  assert.equal(lv.lineBuildable(0, 0, undefined), false);
});

test('guard rule: lines touching R, B, bridge, teleporter, river, rock or the border are not buildable', () => {
  const lv = parseLevel(SPEC_LEVEL);
  const has = (x, y, d) => buildableLines(lv).some((w) => w[0] === x && w[1] === y && w[2] === d);
  // start (2,1): all four lines around it
  assert.equal(has(2, 1, 'R'), false);
  assert.equal(has(1, 1, 'R'), false);
  assert.equal(has(2, 1, 'D'), false);
  assert.equal(has(2, 0, 'D'), false);
  // beacon (4,5)
  assert.equal(has(4, 5, 'R'), false);
  assert.equal(has(3, 5, 'R'), false);
  assert.equal(has(4, 5, 'D'), false);
  assert.equal(has(4, 4, 'D'), false);
  // bridge (2,3)
  assert.equal(has(2, 2, 'D'), false);
  assert.equal(has(2, 3, 'D'), false);
  // teleporters (0,4) and (6,6)
  assert.equal(has(0, 4, 'R'), false);
  assert.equal(has(0, 4, 'D'), false);
  assert.equal(has(0, 3, 'D'), false);
  assert.equal(has(5, 6, 'R'), false);
  assert.equal(has(6, 5, 'D'), false);
  // rock (3,2)
  assert.equal(has(2, 2, 'R'), false);
  assert.equal(has(3, 2, 'R'), false);
  assert.equal(has(3, 1, 'D'), false);
  assert.equal(has(3, 2, 'D'), false);
  // river row
  assert.equal(has(0, 2, 'D'), false);
  assert.equal(has(0, 3, 'R'), false);
  // plain grass|grass lines are buildable
  assert.equal(has(0, 0, 'R'), true);
  assert.equal(has(5, 4, 'D'), true);
  assert.equal(has(1, 4, 'R'), true);
});

test('buildableLines: canonical, ordered, no border, grass on both sides', () => {
  const lv = parseLevel(SPEC_LEVEL);
  const lines = buildableLines(lv);
  assert.ok(lines.length > 0);
  const seen = new Set();
  let prev = -1;
  for (const [x, y, d] of lines) {
    assert.ok(d === 'R' || d === 'D');
    const [x2, y2] = d === 'R' ? [x + 1, y] : [x, y + 1];
    assert.ok(x2 < lv.size && y2 < lv.size, 'inside the border');
    assert.equal(lv.tile(x, y), '.');
    assert.equal(lv.tile(x2, y2), '.');
    const key = `${x},${y},${d}`;
    assert.ok(!seen.has(key));
    seen.add(key);
    const order = (y * lv.size + x) * 2 + (d === 'D' ? 1 : 0);
    assert.ok(order > prev);
    prev = order;
  }
});

test('buildableLines on open grass: 2 * n * (n - 1) lines minus those touching R and B', () => {
  const lv = parseLevel(makeLevel(['R...', '....', '....', '...B']));
  // 24 interior lines; R touches 2, B touches 2
  assert.equal(buildableLines(lv).length, 24 - 4);
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
