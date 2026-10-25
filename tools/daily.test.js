import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLevel, findPath, solve, countAnswers, simulate, cutsAllRoutes } from '../src/game/index.js';
import { isRingAnswer } from './generate.js';
import { addDays, buildDaily, DAILY_DEFAULTS } from './build-daily.js';

const file = fileURLToPath(new URL('../assets/levels/daily.json', import.meta.url));
const daily = JSON.parse(readFileSync(file, 'utf8'));

test('addDays: month, year and leap-day rollovers', () => {
  assert.equal(addDays('2026-10-27', 0), '2026-10-27');
  assert.equal(addDays('2026-10-27', 5), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.throws(() => addDays('27/10/2026', 1), /YYYY-MM-DD/);
});

test('daily: shape, 120+ days, ids are consecutive dates from the start', () => {
  assert.equal(daily.id, 'daily');
  assert.equal(daily.start, '2026-10-27');
  assert.ok(daily.levels.length >= 120, `${daily.levels.length} levels`);
  daily.levels.forEach((l, i) => {
    assert.equal(l.id, `d-${addDays(daily.start, i)}`);
    assert.equal(l.size, 9, l.id);
  });
  assert.equal(new Set(daily.levels.map((l) => l.tiles.join('/'))).size, daily.levels.length, 'all boards differ');
});

test('daily: every level is consistent with the engine (all of them are checked)', () => {
  for (const raw of daily.levels) {
    const lv = parseLevel(raw);
    const s = solve(lv);
    assert.ok(s, raw.id);
    assert.ok(raw.par >= 3, `${raw.id} par ${raw.par}`);
    assert.equal(raw.par, s.par, `${raw.id} par`);
    assert.equal(raw.parAnswers, 1, `${raw.id} parAnswers`);
    assert.equal(raw.parAnswers, countAnswers(lv, s.par), `${raw.id} countAnswers`);
    assert.equal(raw.wallBudget, raw.par + 1, `${raw.id} wallBudget`);
    assert.equal(simulate(lv, []).result, 'lose', `${raw.id} robot wins with no walls`);
    assert.equal(cutsAllRoutes(lv, s.answer), false, `${raw.id} par answer leaves a route`);
    const won = simulate(lv, s.answer);
    assert.equal(won.result, 'win', `${raw.id} par answer stops the robot`);
    assert.equal(won.reason, 'too-far', `${raw.id} every win is out of moves`);
    assert.equal(isRingAnswer(lv, s.answer), false, `${raw.id} ring`);
    assert.ok(findPath(lv, []).positions.length - 1 >= raw.size, `${raw.id} route length`);
  }
});

test('daily: reproducible from the seed (the first days rebuild identically)', () => {
  const again = buildDaily({ days: 8, start: daily.start, seed: DAILY_DEFAULTS.seed });
  assert.deepEqual(again.levels, daily.levels.slice(0, 8));
});
