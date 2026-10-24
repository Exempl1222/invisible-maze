import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from './level.js';
import { simulate } from './simulate.js';
import { SPEC_LEVEL, SPEC_ANSWER, makeLevel } from './fixtures.test.js';

const P = (tiles, extra) => parseLevel(makeLevel(tiles, extra));

test('spec example with no walls: robot reaches the beacon in 9 moves (lose)', () => {
  const r = simulate(parseLevel(SPEC_LEVEL), []);
  assert.equal(r.result, 'lose');
  assert.equal(r.reason, 'reached');
  assert.equal(r.movesUsed, 9);
  assert.equal(r.steps.length, 10);
  assert.equal(r.teleports.length, 1);
});

test('spec example with the par answer: win, blocked, robot stays put', () => {
  const r = simulate(parseLevel(SPEC_LEVEL), SPEC_ANSWER);
  assert.equal(r.result, 'win');
  assert.equal(r.reason, 'blocked');
  assert.equal(r.movesUsed, 0);
  assert.deepEqual(r.steps, [[2, 2]]);
  assert.deepEqual(r.teleports, []);
});

test('too far: walks exactly moveLimit moves along the route then stops', () => {
  const lv = P(['R...B', '#####', '#####', '#####', '#####'], { moveLimit: 2 });
  const r = simulate(lv, []);
  assert.equal(r.result, 'win');
  assert.equal(r.reason, 'too-far');
  assert.equal(r.movesUsed, 2);
  assert.deepEqual(r.steps, [[0, 0], [1, 0], [2, 0]]);
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

test('invalid walls are rejected', () => {
  const lv = parseLevel(SPEC_LEVEL);
  const bad = {
    'bridge': [5, 0],
    'river': [6, 0],
    'teleporter': [0, 8],
    'rock': [3, 4],
    'robot start': [2, 2],
    'beacon': [8, 7],
  };
  for (const [name, w] of Object.entries(bad)) {
    assert.throws(() => simulate(lv, [w]), /buildable|grass/i, name);
  }
  assert.throws(() => simulate(lv, [[1, 1], [1, 1]]), /duplicate/i);
  assert.throws(() => simulate(lv, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]), /budget/i);
  assert.throws(() => simulate(lv, [[9, 9]]), /bounds|outside/i);
  assert.throws(() => simulate(lv, [[1.5, 0]]), /wall/i);
  assert.throws(() => simulate(lv, 'nope'), /walls/i);
  assert.doesNotThrow(() => simulate(lv, [[0, 0], [1, 0], [2, 0], [3, 0]]));
});
