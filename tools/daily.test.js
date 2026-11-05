import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseLevel, buildableLines, findPath, solve, countAnswers, simulate, cutsAllRoutes, capViolation } from '../src/game/index.js';
import { isRingAnswer, invalidBridges } from './generate.js';
import { levelWithoutLimit } from '../assets/js/daily/judge.js';
import { addDays, buildDaily, buildDay, daySeed, withoutAnswer, winsAtParFromEnds, dailyPar, easyPar, weekdayUTC, DAILY_DEFAULTS, DAILY_REFRESH } from './build-daily.js';

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
    // No answer is stored (v3.4), so the other days only get the cheap checks; the exactPar test below solves a sample.
    const exact = idx++ < 14 || (idx - 1) % 5 === 0;
    assert.equal(simulate(lv, []).result, 'lose', `${raw.id} robot reaches the beacon with no walls`);
    assert.equal(raw.wallBudget, raw.par + 2, `${raw.id} wallBudget`);
    assert.ok(findPath(lv, []).positions.length - 1 >= raw.size, `${raw.id} route length`);
    if (!exact) {
      assert.ok(raw.parAnswers >= 1 && raw.parAnswers <= 50, `${raw.id} parAnswers range`);
      continue;
    }
    const s = solve(lv, { maxPar: raw.par });
    assert.ok(s, raw.id);
    assert.equal(raw.par, s.par, `${raw.id} par`);
    assert.equal(raw.parAnswers, countAnswers(lv, s.par, 50), `${raw.id} countAnswers`);
    assert.equal(cutsAllRoutes(lv, s.answer), false, `${raw.id} par answer leaves a route`);
    const won = simulate(lv, s.answer);
    assert.equal(won.result, 'win', `${raw.id} par answer stops the robot`);
    assert.equal(won.reason, 'too-far', `${raw.id} every win is out of moves`);
    assert.equal(isRingAnswer(lv, s.answer), false, `${raw.id} ring`);
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

test('daily-easy: every level is consistent under the Easy page rules (budget = buildable lines), par is exact on a sample', () => {
  easy.levels.forEach((raw, idx) => {
    const base = parseLevel(raw);
    const lv = parseLevel({ ...raw, wallBudget: buildableLines(base).length });
    assert.equal(simulate(lv, []).result, 'lose', `${raw.id} robot reaches the beacon with no walls`);
    assert.ok(raw.parAnswers >= 1 && raw.parAnswers <= 50, `${raw.id} parAnswers range`);
    // the browser solves at the stored par: that answer must be legal and win (and nothing wins in fewer walls)
    const s = solve(lv, { exactPar: raw.par });
    assert.ok(s, `${raw.id} has an answer at par`);
    assert.equal(s.answer.length, raw.par, `${raw.id} answer is par-sized`);
    assert.equal(capViolation(lv, s.answer), null, `${raw.id} answer within the side cap`);
    assert.equal(cutsAllRoutes(lv, s.answer), false, `${raw.id} answer leaves a route`);
    const won = simulate(lv, s.answer);
    assert.equal(won.result, 'win', `${raw.id} answer wins`);
    assert.equal(won.reason, 'too-far', `${raw.id} win is out of moves`);
    assert.equal(isRingAnswer(lv, s.answer), false, `${raw.id} ring`);
    if (idx % 3 === 0) {
      assert.equal(solve(lv, { exactPar: raw.par - 1 }), null, `${raw.id} nothing wins in par-1 walls`);
      assert.equal(solve(lv, { maxPar: raw.par }).par, raw.par, `${raw.id} par is the true par`);
      assert.equal(countAnswers(lv, raw.par, 50), raw.parAnswers, `${raw.id} countAnswers`);
    }
  });
});

test('daily (Hard): a sample of days solves at the stored par, wins under the engine, and nothing wins at par-1', () => {
  // Days spread over the batch: before and after the refresh, every weekday (Sundays are par 6, the slow ones).
  const sample = [0, 5, 12, 16, 19, 40, 60, 90, 120, 150, 179];
  for (const i of sample) {
    const raw = daily.levels[i];
    const lv = levelWithoutLimit(raw);
    const s = solve(lv, { exactPar: raw.par });
    assert.ok(s, `${raw.id} has an answer at par`);
    assert.equal(s.answer.length, raw.par, `${raw.id} answer is par-sized`);
    assert.deepEqual(solve(lv, { exactPar: raw.par }), s, `${raw.id} same input, same answer`);
    const won = simulate(lv, s.answer);
    assert.equal(won.result, 'win', `${raw.id} wins`);
    assert.equal(won.reason, 'too-far', `${raw.id} out of moves`);
    assert.equal(solve(lv, { exactPar: raw.par - 1 }), null, `${raw.id} nothing wins in par-1 walls`);
  }
});

// ---- v3.4: answers off the page ----

test('shipped daily files have no "answer" key anywhere (v3.4)', () => {
  for (const [name, file] of [['daily', daily], ['daily-easy', easy]]) {
    assert.ok(!/"answer"/.test(JSON.stringify(file)), `${name} holds no answer`);
    for (const l of file.levels) assert.equal('answer' in l, false, l.id);
  }
  assert.deepEqual(withoutAnswer({ id: 'x', par: 3, answer: [[0, 0, 'R']] }), { id: 'x', par: 3 });
});

/** The fields a player's saved results depend on. */
const playable = (l) => ({ id: l.id, size: l.size, tiles: l.tiles, rules: l.rules, moveLimit: l.moveLimit, wallBudget: l.wallBudget, par: l.par, parAnswers: l.parAnswers });
const PRE_CUTOVER_SHA = {
  daily: 'f2e401d16625af2ff3191eed41ef4675aae936f0dbac6a7df027935343908a07',
  'daily-easy': 'a1dd91b6abac58aa93a86bc4ff58679771c3681519a0723bf306060f18fc7b65',
};

test('days before the refresh date never change: their playable fields are pinned by hash (v3.4)', () => {
  assert.equal(DAILY_REFRESH.from, '2026-11-12');
  for (const [name, file] of [['daily', daily], ['daily-easy', easy]]) {
    const before = file.levels.filter((l) => l.id.slice(2) < DAILY_REFRESH.from);
    assert.equal(before.length, 16, `${name} has 16 days before 12 Nov`);
    const sha = createHash('sha256').update(JSON.stringify(before.map(playable))).digest('hex');
    assert.equal(sha, PRE_CUTOVER_SHA[name], `${name}: a day before ${DAILY_REFRESH.from} changed`);
  }
});

test('daySeed: unchanged before the refresh date, salted from it on', () => {
  const start = DAILY_DEFAULTS.start;
  assert.equal(daySeed(DAILY_DEFAULTS.seed, start, 15, 0), `${DAILY_DEFAULTS.seed}-15-0`); // 2026-11-11
  assert.equal(daySeed(DAILY_DEFAULTS.seed, start, 16, 0), `${DAILY_DEFAULTS.seed}-${DAILY_REFRESH.salt}-16-0`); // 2026-11-12
  assert.equal(daySeed(DAILY_DEFAULTS.seed, start, 16, 3, null), `${DAILY_DEFAULTS.seed}-16-3`);
});

test('the refreshed days rebuild identically from the seed (Easy and Hard, the first refreshed day)', () => {
  assert.deepEqual(buildDay(16, { size: 7 }).level, easy.levels[16]);
  assert.deepEqual(buildDay(16, { size: 9 }).level, daily.levels[16]);
});

test('daily-easy: reproducible from the seed (the first days rebuild identically)', () => {
  const again = buildDaily({ days: 7, start: easy.start, seed: DAILY_DEFAULTS.seed, size: 7 });
  assert.deepEqual(again.levels, easy.levels.slice(0, 7));
});

test('daily-easy: no level can be won at par using only fences beside the gnome or his house', () => {
  for (const l of easy.levels) assert.equal(winsAtParFromEnds(l), false, l.id);
});
