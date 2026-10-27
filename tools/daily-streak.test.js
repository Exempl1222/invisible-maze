import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, addDays } from '../assets/js/daily/streak.js';

const won = (stars = 3) => ({ tries: 1, won: true, stars, walls: [], hint: null, done: true });
const lost = () => ({ tries: 3, won: false, stars: 0, walls: [], hint: null, done: true });
const open = () => ({ tries: 1, won: false, stars: 0, walls: [], hint: null, done: false });

test('addDays crosses month and year ends', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
});

test('no days played', () => {
  const s = computeStats({}, '2026-10-27');
  assert.deepEqual(s, { played: 0, wins: 0, winPct: 0, current: 0, best: 0, dist: { 3: 0, 2: 0, 1: 0, lost: 0 }, today: null });
});

test('one win today', () => {
  const s = computeStats({ '2026-10-27': won(2) }, '2026-10-27');
  assert.equal(s.played, 1);
  assert.equal(s.wins, 1);
  assert.equal(s.winPct, 100);
  assert.equal(s.current, 1);
  assert.equal(s.best, 1);
  assert.deepEqual(s.dist, { 3: 0, 2: 1, 1: 0, lost: 0 });
  assert.equal(s.today, '2');
});

test('two consecutive wins make a streak of 2, ending today', () => {
  const s = computeStats({ '2026-10-27': won(), '2026-10-28': won(1) }, '2026-10-28');
  assert.equal(s.current, 2);
  assert.equal(s.best, 2);
  assert.equal(s.today, '1');
});

test('today not done yet: the streak still counts through yesterday', () => {
  const days = { '2026-10-26': won(), '2026-10-27': won(), '2026-10-28': open() };
  assert.equal(computeStats(days, '2026-10-28').current, 2);
  assert.equal(computeStats({ '2026-10-26': won(), '2026-10-27': won() }, '2026-10-28').current, 2);
  assert.equal(computeStats(days, '2026-10-28').today, null);
});

test('a loss today ends the streak (best keeps it)', () => {
  const days = { '2026-10-26': won(), '2026-10-27': won(), '2026-10-28': lost() };
  const s = computeStats(days, '2026-10-28');
  assert.equal(s.current, 0);
  assert.equal(s.best, 2);
  assert.equal(s.today, 'lost');
});

test('a missed day ends the streak', () => {
  const days = { '2026-10-25': won(), '2026-10-26': won(), '2026-10-28': open() };
  assert.equal(computeStats(days, '2026-10-28').current, 0);
  assert.equal(computeStats(days, '2026-10-28').best, 2);
  // today done after a gap starts again at 1
  assert.equal(computeStats({ ...days, '2026-10-28': won() }, '2026-10-28').current, 1);
});

test('best streak is the longest run ever, not the latest', () => {
  const days = {
    '2026-10-01': won(), '2026-10-02': won(), '2026-10-03': won(), '2026-10-04': lost(),
    '2026-10-05': won(), '2026-10-06': won(),
  };
  const s = computeStats(days, '2026-10-06');
  assert.equal(s.best, 3);
  assert.equal(s.current, 2);
});

test('streaks run across month ends', () => {
  const days = { '2026-10-31': won(), '2026-11-01': won(), '2026-11-02': won() };
  assert.equal(computeStats(days, '2026-11-02').current, 3);
});

test('unfinished days are not played; win percentage rounds', () => {
  const days = { '2026-10-25': won(), '2026-10-26': won(), '2026-10-27': lost(), '2026-10-28': open() };
  const s = computeStats(days, '2026-10-28');
  assert.equal(s.played, 3);
  assert.equal(s.wins, 2);
  assert.equal(s.winPct, 67);
  assert.deepEqual(s.dist, { 3: 2, 2: 0, 1: 0, lost: 1 });
});

const late = (d, on) => ({ ...d, finishedOn: on });

test('archive plays do not count toward the streak, but do count as played', () => {
  const days = {
    '2026-10-26': late(won(), '2026-10-27'), // caught up a day late
    '2026-10-27': late(won(), '2026-10-27'),
  };
  const s = computeStats(days, '2026-10-27');
  assert.equal(s.current, 1);
  assert.equal(s.best, 1);
  assert.equal(s.played, 2);
  assert.equal(s.wins, 2);
  assert.equal(s.winPct, 100);
  assert.deepEqual(s.dist, { 3: 2, 2: 0, 1: 0, lost: 0 });
});

test('catching up does not repair a broken streak', () => {
  const days = {
    '2026-10-25': late(won(), '2026-10-25'),
    '2026-10-26': late(won(), '2026-10-28'), // missed on the day, won later
    '2026-10-27': late(won(), '2026-10-27'),
  };
  const s = computeStats(days, '2026-10-27');
  assert.equal(s.current, 1);
  assert.equal(s.best, 1);
});

test('records without finishedOn (older saves) count as finished on the day', () => {
  assert.equal(computeStats({ '2026-10-26': won(), '2026-10-27': won() }, '2026-10-27').current, 2);
});

test('a today win finished late (after midnight, still on the old page) is not on the day', () => {
  const s = computeStats({ '2026-10-27': late(won(), '2026-10-28') }, '2026-10-28');
  assert.equal(s.current, 0);
});
