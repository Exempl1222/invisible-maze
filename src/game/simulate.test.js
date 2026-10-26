import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from './level.js';
import { simulate, cutsAllRoutes } from './simulate.js';
import { SPEC_LEVEL, SPEC_ANSWER, makeLevel } from './fixtures.test.js';

const P = (tiles, extra) => parseLevel(makeLevel(tiles, extra));

test('spec example with no walls: robot reaches the beacon in 6 moves (lose)', () => {
  const r = simulate(parseLevel(SPEC_LEVEL), []);
  assert.equal(r.result, 'lose');
  assert.equal(r.reason, 'reached');
  assert.equal(r.movesUsed, 6);
  assert.equal(r.steps.length, 7);
});

test('spec example with the par answer: win, too-far, robot walks the move limit', () => {
  const r = simulate(parseLevel(SPEC_LEVEL), SPEC_ANSWER);
  assert.equal(r.result, 'win');
  assert.equal(r.reason, 'too-far');
  assert.equal(r.movesUsed, SPEC_LEVEL.moveLimit);
  assert.equal(r.steps.length, SPEC_LEVEL.moveLimit + 1);
});

test('too far: walks exactly moveLimit moves along the route then stops', () => {
  const lv = P(['R...B', '#####', '#####', '#####', '#####'], { moveLimit: 2 });
  const r = simulate(lv, []);
  assert.equal(r.result, 'win');
  assert.equal(r.reason, 'too-far');
  assert.equal(r.movesUsed, 2);
  assert.deepEqual(r.steps, [[0, 0], [1, 0], [2, 0]]);
});

test('a wall that lengthens the route past the limit wins as too-far, not blocked', () => {
  const lv = P(['R...B', '.###.', '.....', '#####', '#####'], { moveLimit: 6 });
  assert.equal(simulate(lv, []).result, 'lose');
  const r = simulate(lv, [[2, 0, 'R']]); // detour is 8 moves
  assert.equal(r.result, 'win');
  assert.equal(r.reason, 'too-far');
  assert.equal(r.movesUsed, 6);
  assert.equal(r.steps.length, 7);
});

test('exactly at the move limit is still a lose', () => {
  const lv = P(['R...B', '#####', '#####', '#####', '#####'], { moveLimit: 4 });
  const r = simulate(lv, []);
  assert.equal(r.result, 'lose');
  assert.equal(r.movesUsed, 4);
});

test('too-far cut-off keeps only teleports inside the walked part', () => {
  const lv = P(['Ra###', '#####', '#####', '#####', 'a...B'], { moveLimit: 3 });
  const r = simulate(lv, []);
  assert.equal(r.reason, 'too-far');
  assert.equal(r.steps.length, 4);
  assert.deepEqual(r.teleports, [1]);
  const lv2 = P(['R.a##', '#####', '#####', '#####', 'a...B'], { moveLimit: 1 });
  const r2 = simulate(lv2, []);
  assert.deepEqual(r2.steps.length, 2);
  assert.deepEqual(r2.teleports, []);
});

test('teleport jump is one move in the result', () => {
  const lv = P(['Ra###', '#####', '#####', '#####', 'a...B']);
  const r = simulate(lv, []);
  assert.equal(r.movesUsed, 5);
  assert.deepEqual(r.teleports, [1]);
});

test('invalid walls are rejected with clear errors', () => {
  const lv = parseLevel(SPEC_LEVEL);
  const bad = {
    'line beside the robot start': [[2, 1, 'R'], /buildable|grass/i],
    'line below the robot start': [[2, 1, 'D'], /buildable|grass/i],
    'line above the robot start': [[2, 0, 'D'], /buildable|grass/i],
    'line beside the beacon': [[3, 5, 'R'], /buildable|grass/i],
    'line below the bridge': [[2, 3, 'D'], /buildable|grass/i],
    'line above the bridge': [[2, 2, 'D'], /buildable|grass/i],
    'line beside a teleporter': [[0, 4, 'D'], /buildable|grass/i],
    'line beside a rock': [[2, 2, 'R'], /buildable|grass/i],
    'line beside the river': [[0, 2, 'D'], /buildable|grass/i],
    'right border': [[6, 0, 'R'], /border/i],
    'bottom border': [[0, 6, 'D'], /border/i],
    'outside the grid': [[7, 0, 'R'], /outside/i],
    'non-canonical direction L': [[1, 0, 'L'], /canonical|direction/i],
    'non-canonical direction U': [[1, 1, 'U'], /canonical|direction/i],
    'old two-number wall': [[1, 1], /wall/i],
    'fractional': [[1.5, 0, 'R'], /wall/i],
  };
  for (const [name, [w, re]] of Object.entries(bad)) {
    assert.throws(() => simulate(lv, [w]), re, name);
  }
  assert.throws(() => simulate(lv, [[0, 0, 'R'], [0, 0, 'R']]), /duplicate/i);
  assert.throws(() => simulate(lv, [[0, 0, 'R'], [1, 0, 'R'], [2, 0, 'R'], [3, 0, 'R'], [4, 0, 'R'], [5, 0, 'R'], [0, 1, 'R']]), /budget/i);
  assert.throws(() => simulate(lv, 'nope'), /walls/i);
  assert.doesNotThrow(() => simulate(lv, [[0, 0, 'R'], [1, 0, 'R'], [2, 0, 'R'], [3, 0, 'R'], [4, 0, 'R'], [5, 0, 'R']]));
});

test('via: lines up with steps and names the teleporter stepped onto', () => {
  const lv = P(['Ra...', '#####', '...aB', '#####', '#####'], {});
  const r = simulate(lv, []);
  assert.equal(r.result, 'lose');
  assert.equal(r.via.length, r.steps.length);
  assert.equal(r.via[0], null);
  assert.deepEqual(r.via[1], [1, 0]);
  assert.deepEqual(r.steps[1], [3, 2]);
  assert.equal(r.via[2], null);
});

test('via is cut to the move limit on a too-far win', () => {
  const lv = P(['R...B', '#####', '#####', '#####', '#####'], { moveLimit: 2 });
  const r = simulate(lv, []);
  assert.equal(r.via.length, r.steps.length);
});

// A corridor with a side loop: one wall can lengthen the route, two cut it off.
const LOOP = ['R...B', '.###.', '.....', '#####', '#####'];

test('cutsAllRoutes: false with a route left, true when every route is cut', () => {
  const lv = P(LOOP, { moveLimit: 6 });
  assert.equal(cutsAllRoutes(lv, []), false);
  assert.equal(cutsAllRoutes(lv, [[2, 0, 'R']]), false); // detour round the loop
  assert.equal(cutsAllRoutes(lv, [[2, 0, 'R'], [2, 2, 'R']]), true); // top and bottom both cut
  assert.equal(cutsAllRoutes(lv, [[2, 0, 'R'], [0, 1, 'D'], [4, 1, 'D']]), true);
});

test('cutsAllRoutes: a level with no route at all is always cut', () => {
  assert.equal(cutsAllRoutes(P(['R#B', '###', '###']), []), true);
});

test('cutsAllRoutes: a teleporter keeps a route alive even if the walk is walled', () => {
  const lv = P(['Ra###', '#####', '#####', '#####', 'a...B']);
  assert.equal(cutsAllRoutes(lv, [[2, 4, 'R']]), true);
  assert.equal(cutsAllRoutes(lv, []), false);
});

test('simulate throws a clear error when the walls cut every route', () => {
  const lv = P(LOOP, { moveLimit: 6 });
  assert.throws(() => simulate(lv, [[2, 0, 'R'], [2, 2, 'R']]), /at least one way|every route|no route/i);
  assert.throws(() => simulate(P(['R#B', '###', '###']), []), /at least one way|every route|no route/i);
});

test('simulate results are only win/too-far and lose/reached', () => {
  const lv = P(LOOP, { moveLimit: 6 });
  const seen = new Set();
  for (const walls of [[], [[2, 0, 'R']], [[1, 0, 'R']]]) {
    const r = simulate(lv, walls);
    seen.add(`${r.result}/${r.reason}`);
  }
  for (const k of seen) assert.ok(k === 'win/too-far' || k === 'lose/reached', k);
});
