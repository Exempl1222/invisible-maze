import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel, buildableLines, sideCounts, capViolation, wouldBreakCap } from './level.js';
import { SPEC_LEVEL, makeLevel } from './fixtures.test.js';

test('parses the spec example', () => {
  const lv = parseLevel(SPEC_LEVEL);
  assert.equal(lv.size, 7);
  assert.deepEqual(lv.start, [2, 1]);
  assert.deepEqual(lv.beacon, [4, 5]);
  assert.equal(lv.moveLimit, 10);
  assert.equal(lv.wallBudget, 6);
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

// ---------- rules v4 (lab) ----------

test('rules: absent means v3.1, "v4" is accepted, anything else is rejected', () => {
  assert.equal(parseLevel(makeLevel(['R.', '.B'])).rules, 'v3.1');
  assert.equal(parseLevel(makeLevel(['R.', '.B'], { rules: 'v3.1' })).rules, 'v3.1');
  assert.equal(parseLevel(makeLevel(['R.', '.B'], { rules: 'v4' })).rules, 'v4');
  assert.throws(() => parseLevel(makeLevel(['R.', '.B'], { rules: 'v5' })), /rules/);
  assert.throws(() => parseLevel(makeLevel(['R.', '.B'], { rules: 4 })), /rules/);
});

test('answer field is carried through for hints', () => {
  const lv = parseLevel(makeLevel(['R.', '.B'], { answer: [[0, 0, 'R']] }));
  assert.deepEqual(lv.answer, [[0, 0, 'R']]);
  assert.equal(parseLevel(makeLevel(['R.', '.B'])).answer, undefined);
});

test('v4: lines between two walkable tiles are buildable (bridge, teleporter, start, beacon too)', () => {
  const tiles = ['R=a..', '.....', '.~~~.', '.#...', 'a...B'];
  const v3 = parseLevel(makeLevel(tiles));
  const v4 = parseLevel(makeLevel(tiles, { rules: 'v4' }));
  // start | bridge, bridge | teleporter, start down, beacon left
  for (const [x, y, d] of [[0, 0, 'R'], [1, 0, 'R'], [0, 0, 'D'], [3, 4, 'R'], [4, 3, 'D']]) {
    assert.equal(v3.lineBuildable(x, y, d), false, `v3.1 ${x},${y},${d}`);
    assert.equal(v4.lineBuildable(x, y, d), true, `v4 ${x},${y},${d}`);
  }
  // still never river, rock or the border
  for (const [x, y, d] of [[1, 2, 'R'], [1, 1, 'D'], [0, 3, 'R'], [1, 3, 'D'], [4, 4, 'R'], [4, 0, 'R'], [0, 4, 'D'], [-1, 0, 'R']]) {
    assert.equal(v4.lineBuildable(x, y, d), false, `v4 ${x},${y},${d}`);
  }
  assert.equal(v4.lineBuildable(0, 0, 'L'), false);
  assert.ok(buildableLines(v4).length > buildableLines(v3).length);
});

test('v4 on open grass: every interior line is buildable', () => {
  const lv = parseLevel(makeLevel(['R...', '....', '....', '...B'], { rules: 'v4' }));
  assert.equal(buildableLines(lv).length, 24);
});

test('v4 cap: sideCounts, capViolation and wouldBreakCap', () => {
  const lv = parseLevel(makeLevel(['R...', '....', '....', '...B'], { rules: 'v4' }));
  // start (0,0) has two lines: [0,0,R] and [0,0,D]. Beacon (3,3) has [2,3,R] and [3,2,D].
  assert.deepEqual(sideCounts(lv, [[0, 0, 'R'], [0, 0, 'D'], [2, 3, 'R']]), { start: 2, beacon: 1 });
  assert.equal(capViolation(lv, [[0, 0, 'R'], [0, 0, 'D'], [2, 3, 'R'], [3, 2, 'D']]), null);
  // a corner has only two sides, so use a middle start to exceed the cap
  const mid = parseLevel(makeLevel(['....', '.R..', '....', '...B'], { rules: 'v4' }));
  const three = [[1, 1, 'R'], [1, 1, 'D'], [0, 1, 'R']];
  assert.equal(capViolation(mid, three), 'start');
  assert.equal(capViolation(mid, three.slice(0, 2)), null);
  assert.equal(wouldBreakCap(mid, three.slice(0, 2), three[2]), 'start');
  assert.equal(wouldBreakCap(mid, three.slice(0, 2), [2, 2, 'R']), null);
  const mid2 = parseLevel(makeLevel(['....', '....', '..B.', 'R...'], { rules: 'v4' }));
  assert.equal(wouldBreakCap(mid2, [[2, 2, 'R'], [1, 2, 'R']], [2, 1, 'D']), 'beacon');
  // a line between the start and the beacon counts for both
  const next = parseLevel(makeLevel(['RB..', '....', '....', '....'], { rules: 'v4' }));
  assert.deepEqual(sideCounts(next, [[0, 0, 'R']]), { start: 1, beacon: 1 });
});

test('the cap never applies to v3.1 levels', () => {
  const lv = parseLevel(makeLevel(['....', '.R..', '....', '...B']));
  assert.equal(capViolation(lv, [[1, 1, 'R'], [1, 1, 'D'], [0, 1, 'R']]), null);
});
