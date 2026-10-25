import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from './level.js';
import { findPath } from './path.js';
import { SPEC_LEVEL, SPEC_ANSWER, makeLevel } from './fixtures.test.js';

const P = (tiles, extra) => parseLevel(makeLevel(tiles, extra));

test('spec example: 6 moves over the bridge, no walls', () => {
  const p = findPath(parseLevel(SPEC_LEVEL), []);
  assert.equal(p.positions.length - 1, 6);
  assert.deepEqual(p.positions[0], [2, 1]);
  assert.deepEqual(p.positions.at(-1), [4, 5]);
  assert.equal(p.lines.length, 6);
});

test('spec answer walls leave a route no shorter than the limit', () => {
  const p = findPath(parseLevel(SPEC_LEVEL), SPEC_ANSWER);
  assert.ok(p.positions.length - 1 > SPEC_LEVEL.moveLimit); // a route is left, and it is long
});

test('a teleport costs exactly one move', () => {
  const lv = P(['Ra###', '#####', '#####', '#####', 'a...B']);
  const p = findPath(lv, []);
  assert.deepEqual(p.positions, [[0, 0], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4]]);
  assert.deepEqual(p.teleports, [1]);
  assert.deepEqual(p.via[1], [1, 0]);
  assert.equal(p.via[0], null);
  // the jump crosses only the line between the start and the teleporter it stepped onto
  assert.equal(p.lines.length, 5);
});

test('teleporters are forced: the robot cannot walk through one', () => {
  const lv = P(['RaB##', '#####', '#####', '#####', 'a####']);
  assert.equal(findPath(lv, []), null);
});

test('teleporters are two-way', () => {
  const fwd = P(['.aB##', '#####', '#####', '#####', 'Ra###']);
  assert.deepEqual(findPath(fwd, []).positions, [[0, 4], [1, 0], [2, 0]]);
  const back = P(['.aR##', '#####', '#####', '#####', 'Ba###']);
  assert.deepEqual(findPath(back, []).positions, [[2, 0], [1, 4], [0, 4]]);
});

test('tie-break prefers up, right, down, left', () => {
  const lv = P(['..B', '...', 'R..']);
  assert.deepEqual(findPath(lv, []).positions, [[0, 2], [0, 1], [0, 0], [1, 0], [2, 0]]);
  // line above R walled: right is next
  assert.deepEqual(findPath(lv, [[0, 1, 'D']]).positions, [[0, 2], [1, 2], [1, 1], [1, 0], [2, 0]]);
  assert.deepEqual(findPath(P(['R..', '...', '..B']), []).positions, [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]);
  assert.deepEqual(findPath(P(['..R', '...', 'B..']), []).positions, [[2, 0], [2, 1], [2, 2], [1, 2], [0, 2]]);
});

test('a wall on a line blocks it in both directions', () => {
  // R and B on a 1-wide corridor: wall the middle line, nothing gets through either way
  const fwd = P(['R...B', '#####', '#####', '#####', '#####']);
  assert.equal(findPath(fwd, [[1, 0, 'R']]), null);
  const back = P(['B...R', '#####', '#####', '#####', '#####']);
  assert.equal(findPath(back, [[1, 0, 'R']]), null);
  // vertical lines, both directions
  const down = P(['R####', '.####', '.####', 'B####', '#####']);
  assert.equal(findPath(down, [[0, 1, 'D']]), null);
  const up = P(['B####', '.####', '.####', 'R####', '#####']);
  assert.equal(findPath(up, [[0, 1, 'D']]), null);
});

test('only the walled line is closed: the tiles either side stay usable', () => {
  const lv = P(['B..', '...', 'R..']);
  const p = findPath(lv, [[0, 1, 'D']]);
  assert.equal(p.positions.length - 1, 4);
  const q = findPath(lv, [[0, 1, 'D'], [1, 1, 'D'], [2, 1, 'D']]);
  assert.equal(q, null); // the full row of lines is shut
});

test('only shortest routes are followed even when the preferred direction is longer', () => {
  const lv = P(['B..', '.#.', 'R..']);
  assert.equal(findPath(lv, []).positions.length - 1, 2);
  assert.equal(findPath(lv, [[0, 1, 'D']]).positions.length - 1, 6);
});

test('unreachable returns null; rock, river and walls block; bridges do not', () => {
  assert.equal(findPath(P(['R~B', '###', '...']), []), null);
  assert.equal(findPath(P(['R#B', '###', '...']), []), null);
  assert.notEqual(findPath(P(['R=B', '###', '...']), []), null);
  assert.equal(findPath(P(['R.B', '###', '...']), [[0, 0, 'R']]), null);
});

test('a wall cannot stop a teleport jump, but can stop the approach to the teleporter', () => {
  // R . a  ...  a . B : walking onto a(2,0) jumps to a(2,4)
  const lv = P(['R.a##', '#####', '#####', '#####', '..a.B']);
  assert.deepEqual(lv.partner(2, 0), [2, 4]);
  const open = findPath(lv, []);
  assert.deepEqual(open.positions, [[0, 0], [1, 0], [2, 4], [3, 4], [4, 4]]);
  assert.deepEqual(open.teleports, [2]);
  // walls on the partner's lines are not on the jump: the jump still lands (the exit can be shut though)
  const exitShut = findPath(lv, [[2, 4, 'R']]);
  assert.equal(exitShut, null);
  // a wall on the approach line (not buildable in a real level, but routing honours it) stops the robot
  assert.equal(findPath(lv, [[1, 0, 'R']]), null);
  // a wall elsewhere on the corridor in front of the approach also stops it
  assert.equal(findPath(lv, [[0, 0, 'R']]), null);
});

test('a wall cannot stop the jump itself: walls on every other line change nothing', () => {
  const lv = P(['R.a##', '..###', '#####', '#####', '..a.B']);
  const all = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { all.push([x, y, 'R'], [x, y, 'D']); }
  const inBorder = ([x, y, d]) => (d === 'R' ? x === 4 : y === 4);
  const keep = (w) => !inBorder(w) && !['0,0,R', '1,0,R', '2,4,R', '3,4,R'].includes(w.join(','));
  const walls = all.filter(keep);
  const p = findPath(lv, walls);
  assert.deepEqual(p.positions, [[0, 0], [1, 0], [2, 4], [3, 4], [4, 4]]);
});

test('lines array: each move crosses the line between the tile it left and the tile it stepped onto', () => {
  const lv = P(['Ra###', '#####', '#####', '#####', 'a...B']);
  const p = findPath(lv, []);
  // move 1: R(0,0) -> teleporter (1,0): the "R" line of tile (0,0) => index 0
  assert.equal(p.lines[0], 0);
  // move 2: (0,4) -> (1,4): the "R" line of tile (0,4) => 2 * (4 * 5 + 0)
  assert.equal(p.lines[1], 40);
});
