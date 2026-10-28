import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLevel, buildableLines, findPath, solve, countAnswers, simulate, cutsAllRoutes, capViolation } from '../src/game/index.js';
import { isRingAnswer, invalidBridges } from './generate.js';
import { addDays, buildDaily, winsAtParFromEnds, dailyPar, easyPar, weekdayUTC, DAILY_DEFAULTS } from './build-daily.js';

const file = fileURLToPath(new URL('../assets/levels/daily.json', import.meta.url));
const daily = JSON.parse(readFileSync(file, 'utf8'));

test('addDays: month, year and leap-day rollovers', () => {
  assert.equal(addDays('2026-10-27', 0), '2026-10-27');
  assert.equal(addDays('2026-10-27', 5), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.throws(() => addDays('27/10/2026', 1), /YYYY-MM-DD/);
});

test('weekdayUTC and dailyPar: computed from the date string (Sunday 6, Mon-Wed 4, Thu-Sat 5)', () => {
  assert.equal(weekdayUTC('2026-10-27'), 2); // Tuesday
  assert.equal(weekdayUTC('2026-11-01'), 0); // Sunday
  assert.equal(weekdayUTC('2028-02-29'), 2);
  assert.deepEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'].map(dailyPar), [4, 4, 4, 5, 5, 5, 6]);
  assert.throws(() => weekdayUTC('1/1/2027'), /YYYY-MM-DD/);
});

test('daily: shape, 180 days, ids are consecutive dates from the start, all v4', () => {
  assert.equal(daily.id, 'daily');
  assert.equal(daily.start, '2026-10-27');
  assert.equal(daily.levels.length, 180);
  daily.levels.forEach((l, i) => {
    assert.equal(l.id, `d-${addDays(daily.start, i)}`);
    assert.equal(l.size, 9, l.id);
    assert.equal(l.rules, 'v4', l.id);
  });
  assert.equal(new Set(daily.levels.map((l) => l.tiles.join('/'))).size, daily.levels.length, 'all boards differ');
});

test('daily: par 4-5 Monday to Saturday, par 6 on Sundays (weekday from the date, UTC)', () => {
  let sundays = 0;
  daily.levels.forEach((l) => {
    const date = l.id.slice(2);
    if (weekdayUTC(date) === 0) {
      sundays++;
      assert.equal(l.par, 6, `${l.id} is a Sunday`);
    } else {
      assert.ok(l.par === 4 || l.par === 5, `${l.id} par ${l.par}`);
    }
  });
  assert.equal(sundays, daily.levels.filter((l) => weekdayUTC(l.id.slice(2)) === 0).length);
  assert.equal(sundays, 25); // 2026-11-01 is the first Sunday, then every 7th day to day 179
});

test('daily: every bridge in every level spans a river', () => {
  for (const l of daily.levels) assert.deepEqual(invalidBridges(l.tiles), [], `${l.id}\n${l.tiles.join('\n')}`);
});

test('daily: every level is consistent with the engine under v4 (all of them are checked)', () => {
  let idx = 0;
  for (const raw of daily.levels) {
    const lv = parseLevel(raw);
    assert.equal(lv.rules, 'v4', raw.id);
    // Proving par is slow (par 6 about 10 s a level), so the exact solve and answer count run on the first
    // 14 days (two of each weekday, Sundays included) and every 5th day after; the build proved the rest.
    // Every level is still checked through its stored answer below.
    const exact = idx++ < 14 || (idx - 1) % 5 === 0;
    const s = exact ? solve(lv, { maxPar: raw.par }) : { par: raw.par, answer: raw.answer };
    assert.ok(s, raw.id);
    assert.equal(raw.par, s.par, `${raw.id} par`);
    if (exact) assert.equal(raw.parAnswers, countAnswers(lv, s.par, 50), `${raw.id} countAnswers`);
    else assert.ok(raw.parAnswers >= 1 && raw.parAnswers <= 50, `${raw.id} parAnswers range`);
    assert.equal(raw.wallBudget, raw.par + 2, `${raw.id} wallBudget`);
    assert.equal(simulate(lv, []).result, 'lose', `${raw.id} robot reaches the beacon with no walls`);
    assert.equal(cutsAllRoutes(lv, s.answer), false, `${raw.id} par answer leaves a route`);
    const won = simulate(lv, s.answer);
    assert.equal(won.result, 'win', `${raw.id} par answer stops the robot`);
    assert.equal(won.reason, 'too-far', `${raw.id} every win is out of moves`);
    // stored answer (hints): within the side cap, par-sized, legal and winning
    assert.ok(Array.isArray(raw.answer), `${raw.id} has an answer`);
    assert.equal(raw.answer.length, raw.par, `${raw.id} stored answer length is par`);
    assert.equal(capViolation(lv, raw.answer), null, `${raw.id} stored answer within the side cap`);
    assert.equal(cutsAllRoutes(lv, raw.answer), false, `${raw.id} stored answer leaves a route`);
    const stored = simulate(lv, raw.answer); // throws if illegal
    assert.equal(stored.result, 'win', `${raw.id} stored answer is legal and wins`);
    assert.equal(stored.reason, 'too-far', `${raw.id} stored answer is out of moves`);
    assert.equal(isRingAnswer(lv, s.answer), false, `${raw.id} ring`);
    assert.ok(findPath(lv, []).positions.length - 1 >= raw.size, `${raw.id} route length`);
  }
});

test('daily: reproducible from the seed (the first days rebuild identically, Sunday included)', () => {
  const again = buildDaily({ days: 7, start: daily.start, seed: DAILY_DEFAULTS.seed });
  assert.deepEqual(again.levels, daily.levels.slice(0, 7));
});

// ---- Easy: 7x7, par 3 Monday to Saturday, par 4 Sunday ----
const easyFile = fileURLToPath(new URL('../assets/levels/daily-easy.json', import.meta.url));
const easy = JSON.parse(readFileSync(easyFile, 'utf8'));

test('easyPar: par 3 Monday to Saturday, par 4 on Sunday (weekday from the date, UTC)', () => {
  assert.deepEqual(['2026-10-26', '2026-10-27', '2026-10-31', '2026-11-01'].map(easyPar), [3, 3, 3, 4]);
});

test('daily-easy: shape, 180 days, ids e-DATE from the same start, 7x7, v4, boards unique', () => {
  assert.equal(easy.id, 'daily-easy');
  assert.equal(easy.start, daily.start);
  assert.equal(easy.levels.length, 180);
  easy.levels.forEach((l, i) => {
    assert.equal(l.id, `e-${addDays(easy.start, i)}`);
    assert.equal(l.size, 7, l.id);
    assert.equal(l.rules, 'v4', l.id);
  });
  assert.equal(new Set(easy.levels.map((l) => l.tiles.join('/'))).size, easy.levels.length, 'all boards differ');
});

test('daily-easy: par follows the schedule', () => {
  let sundays = 0;
  for (const l of easy.levels) {
    const date = l.id.slice(2);
    assert.equal(l.par, easyPar(date), l.id);
    if (weekdayUTC(date) === 0) sundays++;
  }
  assert.equal(sundays, 25);
});

test('daily-easy: every bridge spans a river', () => {
  for (const l of easy.levels) assert.deepEqual(invalidBridges(l.tiles), [], `${l.id}\n${l.tiles.join('\n')}`);
});

test('daily-easy: every stored answer wins under the Easy page rules (budget = buildable lines), par is exact on a sample', () => {
  easy.levels.forEach((raw, idx) => {
    const base = parseLevel(raw);
    const lv = parseLevel({ ...raw, wallBudget: buildableLines(base).length });
    assert.equal(simulate(lv, []).result, 'lose', `${raw.id} robot reaches the beacon with no walls`);
    assert.ok(Array.isArray(raw.answer) && raw.answer.length === raw.par, `${raw.id} answer is par-sized`);
    assert.ok(raw.parAnswers >= 1 && raw.parAnswers <= 50, `${raw.id} parAnswers range`);
    assert.equal(capViolation(lv, raw.answer), null, `${raw.id} answer within the side cap`);
    assert.equal(cutsAllRoutes(lv, raw.answer), false, `${raw.id} answer leaves a route`);
    const won = simulate(lv, raw.answer);
    assert.equal(won.result, 'win', `${raw.id} stored answer wins`);
    assert.equal(won.reason, 'too-far', `${raw.id} win is out of moves`);
    assert.equal(isRingAnswer(lv, raw.answer), false, `${raw.id} ring`);
    if (idx % 3 === 0) {
      const s = solve(lv, { maxPar: raw.par });
      assert.equal(s.par, raw.par, `${raw.id} par is the true par`);
      assert.equal(countAnswers(lv, s.par, 50), raw.parAnswers, `${raw.id} countAnswers`);
    }
  });
});

test('daily-easy: reproducible from the seed (the first days rebuild identically)', () => {
  const again = buildDaily({ days: 7, start: easy.start, seed: DAILY_DEFAULTS.seed, size: 7 });
  assert.deepEqual(again.levels, easy.levels.slice(0, 7));
});

test('daily-easy: no level can be won at par using only fences beside the gnome or his house', () => {
  for (const l of easy.levels) assert.equal(winsAtParFromEnds(l), false, l.id);
});
