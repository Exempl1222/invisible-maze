import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, addDays } from '../assets/js/daily/streak.js';

const mk = (tries, done = true, finishedOn = null) => ({ tries, hint: null, walls: [], done, finishedOn });
const won = (score = 100) => mk([{ fences: 3, won: true, score }]);
const lost = () => mk([0, 1, 2].map(() => ({ fences: 3, won: false, score: 0 })));
const open = () => mk([{ fences: 3, won: false, score: 0 }], false);
const late = (d, on) => ({ ...d, finishedOn: on });
const noDist = { 100: 0, 80: 0, 60: 0, 30: 0, 1: 0, 0: 0 };

test('addDays crosses month and year ends', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
});

test('no days played', () => {
  assert.deepEqual(computeStats({}, '2026-10-27'), { played: 0, wins: 0, winPct: 0, average: 0, bestScore: 0, current: 0, bestStreak: 0, dist: noDist, today: null });
});

test('one win today: played, win %, average, best, streaks and its band', () => {
  const s = computeStats({ '2026-10-27': won(88) }, '2026-10-27');
  assert.deepEqual(s, { played: 1, wins: 1, winPct: 100, average: 88, bestScore: 88, current: 1, bestStreak: 1, dist: { ...noDist, 80: 1 }, today: '80' });
});

test('a day scores its best winning try, not the last one', () => {
  const d = mk([{ fences: 5, won: true, score: 77 }, { fences: 3, won: true, score: 100 }, { fences: 9, won: true, score: 30 }]);
  const s = computeStats({ '2026-10-27': d }, '2026-10-27');
  assert.equal(s.bestScore, 100);
  assert.equal(s.today, '100');
});

test('average and best are over played days, losses count 0; every band has its edges', () => {
  const days = {
    '2026-10-20': won(100), '2026-10-21': won(99), '2026-10-22': won(80), '2026-10-23': won(79), '2026-10-24': won(60),
    '2026-10-25': won(59), '2026-10-26': won(30), '2026-10-27': won(29), '2026-10-28': won(15), '2026-10-29': lost(),
  };
  const s = computeStats(days, '2026-10-29');
  assert.deepEqual(s.dist, { 100: 1, 80: 2, 60: 2, 30: 2, 1: 2, 0: 1 });
  assert.equal(s.played, 10);
  assert.equal(s.wins, 9);
  assert.equal(s.winPct, 90);
  assert.equal(s.average, Math.round((100 + 99 + 80 + 79 + 60 + 59 + 30 + 29 + 15) / 10));
  assert.equal(s.bestScore, 100);
  assert.equal(s.today, '0');
});

test('two consecutive wins make a streak of 2, ending today', () => {
  const s = computeStats({ '2026-10-27': won(), '2026-10-28': won(60) }, '2026-10-28');
  assert.equal(s.current, 2);
  assert.equal(s.bestStreak, 2);
  assert.equal(s.today, '60');
});

test('today not done yet: the streak still counts through yesterday', () => {
  const days = { '2026-10-26': won(), '2026-10-27': won(), '2026-10-28': open() };
  assert.equal(computeStats(days, '2026-10-28').current, 2);
  assert.equal(computeStats({ '2026-10-26': won(), '2026-10-27': won() }, '2026-10-28').current, 2);
  assert.equal(computeStats(days, '2026-10-28').today, null);
  assert.equal(computeStats(days, '2026-10-28').played, 2);
});

test('a loss today (score 0) ends the streak; the best streak keeps it', () => {
  const days = { '2026-10-26': won(), '2026-10-27': won(), '2026-10-28': lost() };
  const s = computeStats(days, '2026-10-28');
  assert.equal(s.current, 0);
  assert.equal(s.bestStreak, 2);
});

test('a missed day ends the streak', () => {
  const days = { '2026-10-25': won(), '2026-10-26': won(), '2026-10-28': open() };
  assert.equal(computeStats(days, '2026-10-28').current, 0);
  assert.equal(computeStats(days, '2026-10-28').bestStreak, 2);
  assert.equal(computeStats({ ...days, '2026-10-28': won() }, '2026-10-28').current, 1);
});

test('best streak is the longest run ever, not the latest; runs cross month ends', () => {
  const days = { '2026-10-01': won(), '2026-10-02': won(), '2026-10-03': won(), '2026-10-04': lost(), '2026-10-05': won(), '2026-10-06': won() };
  const s = computeStats(days, '2026-10-06');
  assert.equal(s.bestStreak, 3);
  assert.equal(s.current, 2);
  assert.equal(computeStats({ '2026-10-31': won(), '2026-11-01': won(), '2026-11-02': won() }, '2026-11-02').current, 3);
});

test('a low score still keeps the streak alive (any score above 0)', () => {
  assert.equal(computeStats({ '2026-10-26': won(15), '2026-10-27': won(30) }, '2026-10-27').current, 2);
});

test('archive plays do not count toward the streak, but do count as played', () => {
  const days = { '2026-10-26': late(won(), '2026-10-27'), '2026-10-27': late(won(), '2026-10-27') };
  const s = computeStats(days, '2026-10-27');
  assert.equal(s.current, 1);
  assert.equal(s.bestStreak, 1);
  assert.equal(s.played, 2);
  assert.equal(s.wins, 2);
  assert.equal(s.dist['100'], 2);
});

test('catching up does not repair a broken streak', () => {
  const days = { '2026-10-25': late(won(), '2026-10-25'), '2026-10-26': late(won(), '2026-10-28'), '2026-10-27': late(won(), '2026-10-27') };
  const s = computeStats(days, '2026-10-27');
  assert.equal(s.current, 1);
  assert.equal(s.bestStreak, 1);
});

test('records without finishedOn (older saves) count as finished on the day', () => {
  assert.equal(computeStats({ '2026-10-26': won(), '2026-10-27': won() }, '2026-10-27').current, 2);
});

test('a today win finished late (after midnight, still on the old page) is not on the day', () => {
  assert.equal(computeStats({ '2026-10-27': late(won(), '2026-10-28') }, '2026-10-28').current, 0);
});

test('streaks are per mode: each mode computes from its own days only', () => {
  const easy = { '2026-10-26': won(), '2026-10-27': won(), '2026-10-28': won() };
  const hard = { '2026-10-27': won(), '2026-10-28': lost() };
  assert.equal(computeStats(easy, '2026-10-28').current, 3);
  assert.equal(computeStats(hard, '2026-10-28').current, 0);
  assert.equal(computeStats(hard, '2026-10-28').bestStreak, 1);
});
