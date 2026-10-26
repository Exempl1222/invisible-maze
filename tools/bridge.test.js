import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidBridge, invalidBridges, generateLevels } from './generate.js';

test('isValidBridge: land on both sides along one axis, river on both sides of the other', () => {
  // river runs down, bridge crosses left to right
  assert.equal(isValidBridge(['.....', '..~..', '..=..', '..~..', '.....'], 2, 2), true);
  // river runs across, bridge crosses top to bottom
  assert.equal(isValidBridge(['.....', '.....', '~~=~~', '.....', '.....'], 2, 2), true);
  // start, beacon and teleporters are land
  assert.equal(isValidBridge(['.....', '..~..', 'R.=.B'.replace('.=.', '.=a'), '..~..', '....a'], 2, 2), true);
});

test('isValidBridge: rejects bridges that lead into river, rock, the edge or another bridge', () => {
  // river at a bend: one side of the crossing is river again
  assert.equal(isValidBridge(['.....', '..~..', '.~=..', '..~..', '.....'], 2, 2), false);
  // rock on a landing tile
  assert.equal(isValidBridge(['.....', '..~..', '.#=..', '..~..', '.....'], 2, 2), false);
  assert.equal(isValidBridge(['.....', '..~..', '..=#.', '..~..', '.....'], 2, 2), false);
  // touching the board edge
  assert.equal(isValidBridge(['.....', '..~..', '=.=..'.replace('=.=', '..='), '..~..', '.....'].map((r, i) => (i === 2 ? '.==..' : r)), 2, 2), false);
  assert.equal(isValidBridge(['~....', '=....', '~....', '.....', '.....'], 0, 1), false);
  assert.equal(isValidBridge(['..=..', '.....', '.....', '.....', '.....'], 2, 0), false);
  // river only on one side of the crossing axis pair
  assert.equal(isValidBridge(['.....', '..~..', '..=..', '.....', '.....'], 2, 2), false);
  // two bridges in a row: neither has river on both sides
  assert.equal(isValidBridge(['.....', '..~..', '..=..', '..=..', '..~..'], 2, 2), false);
  assert.equal(isValidBridge(['.....', '..~..', '..=..', '..=..', '..~..'], 2, 3), false);
  // not a bridge tile
  assert.equal(isValidBridge(['.....', '..~..', '..~..', '..~..', '.....'], 2, 2), false);
});

test('invalidBridges lists every bad bridge of a board', () => {
  assert.deepEqual(invalidBridges(['.....', '..~..', '..=..', '..~..', '.....']), []);
  assert.deepEqual(invalidBridges(['.....', '..~..', '.=...', '..~..', '.....']), [[1, 2]]);
});

test('generated boards: every bridge spans a river, on both sizes, over many seeds', () => {
  for (const size of [7, 9]) {
    const { levels } = generateLevels({ size, count: 12, seed: `bridge-${size}`, minPar: 1, maxPar: 6, unique: false, rules: 'v4', budgetExtra: 2, minSlack: 3, maxSlack: 6, maxTries: 3000, maxNodes: 50000 });
    assert.ok(levels.length >= 8, `${size}: ${levels.length} levels`);
    for (const l of levels) {
      assert.deepEqual(invalidBridges(l.tiles), [], `${l.id}\n${l.tiles.join('\n')}`);
      assert.ok(l.tiles.some((r) => r.includes('=')), `${l.id} has a bridge`);
    }
  }
});
