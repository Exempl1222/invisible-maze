import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TRIES } from '../assets/js/daily/config.js';
import { freshDay, cleanDay, parseSaved, serialize, parseLineKey } from '../assets/js/daily/record.js';

test('freshDay is an empty, unfinished day', () => {
  assert.deepEqual(freshDay(), { tries: 0, won: false, stars: 0, walls: [], hint: null, done: false });
});

test('parseSaved: empty, missing and corrupt data give an empty state', () => {
  const empty = { seenHowTo: false, days: {} };
  assert.deepEqual(parseSaved(null), empty);
  assert.deepEqual(parseSaved(''), empty);
  assert.deepEqual(parseSaved('{not json'), empty);
  assert.deepEqual(parseSaved('[1,2]'), empty);
  assert.deepEqual(parseSaved('{"days":5}'), empty);
  assert.deepEqual(parseSaved('"hello"'), empty);
});

test('serialize then parseSaved round-trips', () => {
  const state = {
    seenHowTo: true,
    days: {
      '2026-10-27': { tries: 2, won: true, stars: 2, walls: ['0,3,D', '1,3,D'], hint: '1,3,D', done: true },
      '2026-10-28': { tries: 1, won: false, stars: 0, walls: ['2,2,R'], hint: null, done: false },
    },
  };
  assert.deepEqual(parseSaved(serialize(state)), state);
});

test('parseSaved drops days with a bad date and keeps the good ones', () => {
  const raw = JSON.stringify({ days: { 'nope': { tries: 1 }, '2026-02-30': { tries: 1 }, '2026-10-27': { tries: 1 } } });
  assert.deepEqual(Object.keys(parseSaved(raw).days), ['2026-10-27']);
});

test('cleanDay clamps and repairs', () => {
  assert.deepEqual(cleanDay(null), freshDay());
  assert.deepEqual(cleanDay('x'), freshDay());
  assert.equal(cleanDay({ tries: 99 }).tries, MAX_TRIES);
  assert.equal(cleanDay({ tries: -2 }).tries, 0);
  assert.equal(cleanDay({ tries: 1.5 }).tries, 0);
  assert.equal(cleanDay({ stars: 7, won: true, tries: 1 }).stars, 1); // a win is worth at least a star
});

test('cleanDay: a win is always done and has at least one try', () => {
  const d = cleanDay({ won: true, stars: 3, tries: 0 });
  assert.equal(d.done, true);
  assert.equal(d.tries, 1);
  assert.equal(d.stars, 3);
});

test('cleanDay: all tries spent without a win is a finished loss, never a fresh board', () => {
  const d = cleanDay({ tries: MAX_TRIES, won: false, done: false });
  assert.equal(d.done, true);
  assert.equal(d.won, false);
  assert.equal(d.stars, 0);
});

test('cleanDay: a loss has no stars; an unfinished day has no stars', () => {
  assert.equal(cleanDay({ tries: 3, won: false, stars: 2 }).stars, 0);
  assert.equal(cleanDay({ tries: 1, won: false, done: false, stars: 2 }).stars, 0);
});

test('cleanDay: done with no tries used is impossible, so it is reset', () => {
  assert.deepEqual(cleanDay({ done: true, tries: 0, won: false }), freshDay());
});

test('cleanDay keeps only well-formed line keys, without duplicates', () => {
  const d = cleanDay({ tries: 1, walls: ['0,3,D', '0,3,D', 'bad', '1,2', 5, '4,4,R', '-1,0,R', '1,1,X'], hint: '4,4,R' });
  assert.deepEqual(d.walls, ['0,3,D', '4,4,R']);
  assert.equal(d.hint, '4,4,R');
});

test('cleanDay: a hint that is not among the walls is dropped to its key only if well-formed', () => {
  assert.equal(cleanDay({ tries: 1, walls: [], hint: 'junk' }).hint, null);
  assert.equal(cleanDay({ tries: 1, walls: [], hint: '2,2,D' }).hint, '2,2,D'); // used, wall may have been refused on restore
});

test('parseLineKey', () => {
  assert.deepEqual(parseLineKey('3,4,D'), [3, 4, 'D']);
  assert.deepEqual(parseLineKey('0,0,R'), [0, 0, 'R']);
  assert.equal(parseLineKey('3,4'), null);
  assert.equal(parseLineKey(null), null);
  assert.equal(parseLineKey('3,4,L'), null);
});

test('seenHowTo is only true when it is exactly true', () => {
  assert.equal(parseSaved('{"seenHowTo":true}').seenHowTo, true);
  assert.equal(parseSaved('{"seenHowTo":"yes"}').seenHowTo, false);
});
