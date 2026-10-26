import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLevel, findPath, solve, countAnswers, simulate, cutsAllRoutes, capViolation } from '../src/game/index.js';
import { usesV4Line } from './generate.js';

const file = fileURLToPath(new URL('../assets/levels/lab.json', import.meta.url));
const lab = JSON.parse(readFileSync(file, 'utf8'));

test('lab: shape, 5 levels, ids lab-01 to lab-05, 2 at 7x7 then 3 at 9x9, all v4', () => {
  assert.equal(lab.id, 'lab');
  assert.equal(lab.rules, 'v4');
  assert.equal(lab.levels.length, 5);
  lab.levels.forEach((l, i) => {
    assert.equal(l.id, `lab-0${i + 1}`);
    assert.equal(l.size, i < 2 ? 7 : 9, l.id);
    assert.equal(l.rules, 'v4', l.id);
  });
  assert.equal(new Set(lab.levels.map((l) => l.tiles.join('/'))).size, 5, 'all boards differ');
});

test('lab: pars climb as targeted (7x7: 3 and 4; 9x9: 5, 6, then 7 or the best found)', () => {
  const pars = lab.levels.map((l) => l.par);
  assert.deepEqual(pars.slice(0, 4), [3, 4, 5, 6]);
  assert.ok(pars[4] >= 6 && pars[4] <= 7, `last par ${pars[4]}`);
});

test('lab: every level is consistent with the engine under v4', () => {
  for (const raw of lab.levels) {
    const lv = parseLevel(raw);
    assert.equal(lv.rules, 'v4', `${raw.id} parses as v4`);
    const s = solve(lv);
    assert.ok(s, raw.id);
    assert.equal(raw.par, s.par, `${raw.id} par matches solve`);
    assert.equal(raw.parAnswers, countAnswers(lv, s.par, 50), `${raw.id} parAnswers (capped at 50)`);
    assert.ok(raw.parAnswers >= 1 && raw.parAnswers <= 50, `${raw.id} parAnswers range`);
    assert.equal(raw.wallBudget, raw.par + 2, `${raw.id} budget = par + 2`);

    // the stored answer: legal, within the side cap, par-sized, wins out of moves
    assert.ok(Array.isArray(raw.answer), `${raw.id} has an answer`);
    assert.equal(raw.answer.length, raw.par, `${raw.id} answer length = par`);
    assert.equal(capViolation(lv, raw.answer), null, `${raw.id} answer is within the side cap`);
    assert.equal(cutsAllRoutes(lv, raw.answer), false, `${raw.id} answer leaves a route`);
    const won = simulate(lv, raw.answer); // throws if the answer is illegal
    assert.equal(won.result, 'win', `${raw.id} answer wins`);
    assert.equal(won.reason, 'too-far', `${raw.id} answer wins by running out of moves`);

    // the robot loses with no walls, and the free route is long enough to be a puzzle
    assert.equal(simulate(lv, []).result, 'lose', `${raw.id} robot wins with no walls`);
    assert.ok(findPath(lv, []).positions.length - 1 >= raw.size, `${raw.id} free route length`);
  }
});

test('lab: at least some par answers use a line only v4 allows (so the lab tests the new rules)', () => {
  const uses = lab.levels.filter((raw) => usesV4Line(parseLevel(raw), raw.answer));
  assert.ok(uses.length >= 3, `${uses.length} of 5 use a newly allowed line`);
});

test('lab: move limits have extra slack over the free route', () => {
  for (const raw of lab.levels) {
    const free = findPath(parseLevel(raw), []).positions.length - 1;
    assert.ok(raw.moveLimit - free >= 3, `${raw.id} slack ${raw.moveLimit - free}`);
  }
});
