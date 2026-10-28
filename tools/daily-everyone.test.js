import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statsUrl, dayBefore, resultBody, pendingResults, postOutcome, parseStats, bandRows, beatPercent, MIN_PLAYERS } from '../assets/js/daily/everyone.js';
import { cleanDay } from '../assets/js/daily/record.js';

const W = (fences, base, walls) => ({ fences, won: true, base, walls });
const L = () => ({ fences: 0, won: false, base: 0 });
const done = (o) => cleanDay({ done: true, finishedOn: '2026-10-27', ...o });

test('statsUrl: null by default; the switch is STATS_URL; ?stats= only counts on localhost', () => {
  assert.equal(statsUrl('', 'exempl1222.github.io', null), null);
  assert.equal(statsUrl('?stats=http://evil.example', 'exempl1222.github.io', null), null, 'ignored on the real site');
  assert.equal(statsUrl('?stats=/__stats', 'localhost', null), '/__stats');
  assert.equal(statsUrl('?stats=/__stats/', '127.0.0.1', null), '/__stats');
  assert.equal(statsUrl('', 'localhost', null), null);
  assert.equal(statsUrl('?mode=hard', 'localhost', null), null);
  assert.equal(statsUrl('', 'exempl1222.github.io', 'https://stats.example/'), 'https://stats.example');
  assert.equal(statsUrl('?stats=http://evil.example', 'exempl1222.github.io', 'https://stats.example'), 'https://stats.example');
  assert.equal(statsUrl('', 'exempl1222.github.io'), null, 'the shipped config is off');
});

test('dayBefore crosses month and year ends and rejects non-dates', () => {
  assert.equal(dayBefore('2026-10-27'), '2026-10-26');
  assert.equal(dayBefore('2026-11-01'), '2026-10-31');
  assert.equal(dayBefore('2027-01-01'), '2026-12-31');
  assert.equal(dayBefore('nope'), null);
});

test('resultBody: a win sends the best try\'s fences as [x, y, dir], with the hint and the tries used', () => {
  const day = done({ tries: [W(5, 77, ['0,0,R', '1,1,D', '2,2,R', '3,3,D', '4,4,R']), W(3, 100, ['0,3,D', '1,3,D', '6,6,D'])], hint: '0,3,D' });
  assert.deepEqual(resultBody({ device: 'device-abc123', mode: 'easy', date: '2026-10-27', day }), {
    device: 'device-abc123', mode: 'easy', date: '2026-10-27', fences: [[0, 3, 'D'], [1, 3, 'D'], [6, 6, 'D']], hint: true, tries: 2,
  });
});

test('resultBody: a day with no win sends null fences; a lost try never supplies fences', () => {
  const day = done({ tries: [L(), L(), L()] });
  assert.deepEqual(resultBody({ device: 'device-abc123', mode: 'hard', date: '2026-10-27', day }), { device: 'device-abc123', mode: 'hard', date: '2026-10-27', fences: null, hint: false, tries: 3 });
});

test('resultBody: nothing for an unfinished day, an archive play, or a win with no saved fences', () => {
  const win = [W(3, 100, ['0,3,D'])];
  const args = { device: 'device-abc123', mode: 'easy', date: '2026-10-27' };
  assert.equal(resultBody({ ...args, day: cleanDay({ tries: win }) }), null, 'not done');
  assert.equal(resultBody({ ...args, day: done({ tries: win, finishedOn: '2026-10-30' }) }), null, 'finished on a later date: an archive play');
  assert.equal(resultBody({ ...args, day: done({ tries: [{ fences: 3, won: true, base: 100 }] }) }), null, 'no walls to prove it');
  assert.equal(resultBody({ ...args, day: null }), null);
});

test('pendingResults: finished-on-own-date, unsent days from today or yesterday, both modes', () => {
  const win = [W(3, 100, ['0,3,D'])];
  const days = {
    easy: {
      '2026-10-27': done({ tries: win, finishedOn: '2026-10-27' }), // yesterday, unsent
      '2026-10-28': done({ tries: win, finishedOn: '2026-10-28' }), // today, unsent
      '2026-10-26': done({ tries: win, finishedOn: '2026-10-26' }), // two days ago
    },
    hard: {
      '2026-10-28': done({ tries: win, finishedOn: '2026-10-28', sent: true }), // already sent
      '2026-10-27': done({ tries: win, finishedOn: '2026-10-28' }), // an archive play
    },
  };
  const got = pendingResults(days, '2026-10-28').map((p) => `${p.mode} ${p.date}`).sort();
  assert.deepEqual(got, ['easy 2026-10-27', 'easy 2026-10-28']);
});

test('postOutcome: 2xx is sent, 429 and server or network trouble retry, other 4xx is given up on', () => {
  assert.equal(postOutcome(200), 'sent');
  assert.equal(postOutcome(204), 'sent');
  for (const s of [429, 500, 502, 503]) assert.equal(postOutcome(s), 'retry', String(s));
  for (const s of [400, 403, 404, 405]) assert.equal(postOutcome(s), 'rejected', String(s));
  assert.equal(postOutcome(undefined), 'retry');
  assert.equal(postOutcome(NaN), 'retry');
});

const reply = (o = {}) => ({ players: 14, bands: { 100: 5, '80-99': 3, '60-79': 2, '30-59': 2, '1-29': 1, 0: 1 }, scores: { 100: 5, 88: 3, 70: 2, 40: 2, 20: 1, 0: 1 }, ...o });

test('parseStats reads the server shape into the page\'s band keys, and refuses anything else', () => {
  const s = parseStats(reply());
  assert.equal(s.players, 14);
  assert.deepEqual(s.bands, { 100: 5, 80: 3, 60: 2, 30: 2, 1: 1, 0: 1 });
  assert.deepEqual(s.scores, { 100: 5, 88: 3, 70: 2, 40: 2, 20: 1, 0: 1 });
  for (const bad of [null, 'x', [], {}, reply({ players: -1 }), reply({ players: 'many' }), reply({ bands: null }), reply({ bands: { 100: 1 } }), reply({ bands: { 100: 'a', '80-99': 0, '60-79': 0, '30-59': 0, '1-29': 0, 0: 0 } })]) {
    assert.equal(parseStats(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(parseStats(reply({ scores: undefined })).scores, {});
  assert.deepEqual(parseStats(reply({ scores: { 100: 'x', nope: 3, 88: 3 } })).scores, { 88: 3 });
});

test('bandRows lists the six bands best first with the page\'s labels', () => {
  const rows = bandRows(parseStats(reply()));
  assert.deepEqual(rows.map((r) => [r.label, r.n]), [['100', 5], ['80 to 99', 3], ['60 to 79', 2], ['30 to 59', 2], ['1 to 29', 1], ['0', 1]]);
  assert.deepEqual(rows.map((r) => r.key), ['100', '80', '60', '30', '1', '0']);
});

test('beatPercent: other players with a lower score, rounded down, the player not counted among them', () => {
  const s = parseStats(reply()); // 14 players
  // 100: 13 others, 9 lower (3+2+2+1+1) -> 69%
  assert.equal(beatPercent(s, 100, true), Math.floor((900) / 13));
  assert.equal(beatPercent(s, 100, true), 69);
  // unsent: all 14 are others
  assert.equal(beatPercent(s, 100, false), Math.floor(900 / 14));
  assert.equal(beatPercent(s, 0, true), 0);
  // 70: lower are 40 (2), 20 (1), 0 (1) = 4 of 13 -> 30
  assert.equal(beatPercent(s, 70, true), 30);
  // equal scores are not "lower"
  assert.equal(beatPercent(parseStats(reply({ players: 10, bands: { 100: 10, '80-99': 0, '60-79': 0, '30-59': 0, '1-29': 0, 0: 0 }, scores: { 100: 10 } })), 100, true), 0);
});

test('beatPercent: nothing below 10 players or when nobody else posted, never above 100', () => {
  assert.equal(MIN_PLAYERS, 10);
  const nine = parseStats(reply({ players: 9, scores: { 100: 4, 0: 5 }, bands: { 100: 4, '80-99': 0, '60-79': 0, '30-59': 0, '1-29': 0, 0: 5 } }));
  assert.equal(beatPercent(nine, 100, true), null);
  const ten = parseStats(reply({ players: 10, scores: { 100: 1, 0: 9 }, bands: { 100: 1, '80-99': 0, '60-79': 0, '30-59': 0, '1-29': 0, 0: 9 } }));
  assert.equal(beatPercent(ten, 100, true), 100); // all 9 others are lower
  assert.equal(beatPercent(null, 100, true), null);
});
