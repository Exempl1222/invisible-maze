// The home-page replay shows a real level. This checks every claim it makes against the engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEASER as T } from '../assets/js/teaser-data.js';
import { parseLevel, findPath, simulate, solve, countAnswers } from '../src/game/index.js';

const level = parseLevel({ id: T.id, size: T.size, tiles: T.tiles, moveLimit: T.moveLimit, wallBudget: T.walls.length });

test('teaser: start and beacon match the map', () => {
  assert.deepEqual(level.start, T.start);
  assert.deepEqual(level.beacon, T.beacon);
});

test('teaser: the free route is the one the engine finds, and it beats the move limit', () => {
  const free = findPath(level, []);
  assert.deepEqual(free.positions.slice(1), T.route);
  assert.ok(T.route.length <= T.moveLimit);
  assert.deepEqual(free.positions[0], T.start);
  assert.deepEqual(T.route.at(-1), T.beacon);
  assert.deepEqual(free.teleports, [T.jump.move]);
  assert.deepEqual(free.via[T.jump.move], T.jump.from);
  assert.deepEqual(free.positions[T.jump.move], T.jump.to);
  assert.deepEqual(level.partner(...T.jump.from), T.jump.to);
  assert.equal(simulate(level, []).result, 'lose');
});

test('teaser: the walls are the unique par answer and give the stated result', () => {
  const s = solve(level);
  assert.equal(s.par, T.par);
  assert.equal(T.walls.length, T.par);
  assert.deepEqual([...T.walls].sort(), [...s.answer].sort());
  assert.equal(countAnswers(level, T.par), 1);
  const sim = simulate(level, T.walls);
  assert.equal(sim.result, T.walled.result);
  assert.equal(sim.reason, T.walled.reason);
});
