import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from './level.js';
import { findPath } from './path.js';
import { SPEC_LEVEL, SPEC_ANSWER, makeLevel } from './fixtures.test.js';

const P = (tiles, extra) => parseLevel(makeLevel(tiles, extra));

test('spec example: 9 moves using the teleporter, no walls', () => {
  const p = findPath(parseLevel(SPEC_LEVEL), []);
  assert.equal(p.positions.length - 1, 9);
  assert.deepEqual(p.positions[0], [2, 2]);
  assert.deepEqual(p.positions.at(-1), [8, 7]);
  assert.equal(p.teleports.length, 1);
  const i = p.teleports[0];
  assert.deepEqual(p.positions[i], [8, 8]); // arrival on the partner tile
  assert.deepEqual(p.via[i], [0, 8]); // the tile it stepped onto
});

test('spec answer walls leave no route', () => {
  assert.equal(findPath(parseLevel(SPEC_LEVEL), SPEC_ANSWER), null);
});

test('a teleport costs exactly one move', () => {
  const lv = P(['Ra###', '#####', '#####', '#####', 'a...B']);
  const p = findPath(lv, []);
  assert.deepEqual(p.positions, [[0, 0], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4]]);
  assert.deepEqual(p.teleports, [1]);
  assert.deepEqual(p.via[1], [1, 0]);
  assert.equal(p.via[0], null);
});

test('teleporters are forced: the robot cannot walk through one', () => {
  // The only way to the beacon is across the teleporter tile, but stepping on it moves the robot away.
  const lv = P(['RaB##', '#####', '#####', '#####', 'a####']);
  assert.equal(findPath(lv, []), null);
});

test('teleporters are two-way', () => {
  const fwd = P(['.aB##', '#####', '#####', '#####', 'Ra###']);
  assert.deepEqual(findPath(fwd, []).positions, [[0, 4], [1, 0], [2, 0]]);
  // same pair used from the other end
  const back = P(['.aR##', '#####', '#####', '#####', 'Ba###']);
  assert.deepEqual(findPath(back, []).positions, [[2, 0], [1, 4], [0, 4]]);
});

test('tie-break prefers up, right, down, left', () => {
  const lv = P(['..B', '...', 'R..']);
  assert.deepEqual(findPath(lv, []).positions, [[0, 2], [0, 1], [0, 0], [1, 0], [2, 0]]);
  // up blocked: right is next
  assert.deepEqual(findPath(lv, [[0, 1]]).positions, [[0, 2], [1, 2], [1, 1], [1, 0], [2, 0]]);
  // right before down
  assert.deepEqual(findPath(P(['R..', '...', '..B']), []).positions, [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]);
  // down before left
  assert.deepEqual(findPath(P(['..R', '...', 'B..']), []).positions, [[2, 0], [2, 1], [2, 2], [1, 2], [0, 2]]);
});

test('only shortest routes are followed even when the preferred direction is longer', () => {
  // up is preferred but the wall makes it a detour; the robot goes right instead
  const lv = P(['B..', '.#.', 'R..']);
  assert.equal(findPath(lv, []).positions.length - 1, 2); // (0,1) then (0,0)
  const blocked = findPath(lv, [[0, 1]]);
  assert.equal(blocked.positions.length - 1, 6);
});

test('unreachable returns null; rock, river and walls block; bridges do not', () => {
  assert.equal(findPath(P(['R~B', '###', '...']), []), null);
  assert.equal(findPath(P(['R#B', '###', '...']), []), null);
  assert.notEqual(findPath(P(['R=B', '###', '...']), []), null);
  assert.equal(findPath(P(['R.B', '###', '...']), [[1, 0]]), null);
});
