import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestScore } from '../assets/js/daily/score.js';
import { MAX_TRIES } from '../assets/js/daily/config.js';
import { freshDay, emptySaved, cleanDay, parseSaved, serialize, parseLineKey, mergeDay, mergeSaved, migrateV1 } from '../assets/js/daily/record.js';

const W = (fences, base) => ({ fences, won: true, base });
const L = (fences = 3) => ({ fences, won: false, base: 0 });

test('freshDay is an empty, unfinished day; emptySaved has both modes', () => {
  assert.deepEqual(freshDay(), { tries: [], hint: null, walls: [], done: false, finishedOn: null, reviewing: false });
  assert.deepEqual(emptySaved(), { easy: {}, hard: {}, lastMode: null, seenHowTo: false });
});

test('parseSaved: empty, missing and corrupt data give an empty state', () => {
  for (const raw of [null, '', '{not json', '[1,2]', '{"easy":5}', '"hello"']) assert.deepEqual(parseSaved(raw), emptySaved(), String(raw));
});

test('serialize then parseSaved round-trips, both modes, lastMode and seenHowTo', () => {
  const state = {
    seenHowTo: true,
    lastMode: 'hard',
    easy: { '2026-10-27': { tries: [L(2), W(4, 88)], hint: '1,3,D', walls: ['0,3,D', '1,3,D'], done: true, finishedOn: '2026-10-28', reviewing: false } },
    hard: { '2026-10-28': { tries: [L(5)], hint: null, walls: ['2,2,R'], done: false, finishedOn: null, reviewing: false } },
  };
  assert.deepEqual(parseSaved(serialize(state)), state);
  assert.equal(JSON.parse(serialize(state)).v, 2);
});

test('parseSaved drops days with a bad date and an unknown lastMode', () => {
  const raw = JSON.stringify({ lastMode: 'medium', easy: { nope: { tries: [L()] }, '2026-02-30': { tries: [L()] }, '2026-10-27': { tries: [L()] } } });
  const s = parseSaved(raw);
  assert.deepEqual(Object.keys(s.easy), ['2026-10-27']);
  assert.equal(s.lastMode, null);
});

test('seenHowTo is only true when it is exactly true', () => {
  assert.equal(parseSaved('{"seenHowTo":true}').seenHowTo, true);
  assert.equal(parseSaved('{"seenHowTo":"yes"}').seenHowTo, false);
});

test('cleanDay repairs junk to a fresh day', () => {
  for (const bad of [null, 'x', [], 5, {}, { tries: 'many' }]) assert.deepEqual(cleanDay(bad), freshDay());
});

test('cleanDay: tries are capped at 3 and each is repaired (a loss has base 0, a win 1 to 100)', () => {
  const d = cleanDay({ tries: [W(3, 100), L(), L(), L(), W(3, 100)] });
  assert.equal(d.tries.length, MAX_TRIES);
  assert.deepEqual(cleanDay({ tries: [{ won: false, score: 80, fences: 'x' }] }).tries, [{ fences: 0, won: false, base: 0 }]);
  assert.equal(cleanDay({ tries: [{ won: true, base: 400, fences: 3 }] }).tries[0].base, 1);
  assert.equal(cleanDay({ tries: [{ won: true, base: 1.5, fences: 3 }] }).tries[0].base, 1);
  assert.equal(cleanDay({ tries: [null, 4, W(3, 90)] }).tries.length, 1);
});

test('cleanDay: three tries is a finished day, never a fresh board', () => {
  const d = cleanDay({ tries: [L(), L(), L()], done: false });
  assert.equal(d.done, true);
});

test('cleanDay: done with no tries used is impossible, so it is reset', () => {
  assert.deepEqual(cleanDay({ done: true, tries: [] }), freshDay());
});

test('cleanDay: a win does not end the day by itself (Retry or Submit decides)', () => {
  assert.equal(cleanDay({ tries: [W(3, 100)] }).done, false);
  assert.equal(cleanDay({ tries: [W(3, 100)], done: true }).done, true);
});

test('cleanDay keeps only well-formed line keys, without duplicates, also inside tries', () => {
  const d = cleanDay({ tries: [{ ...W(2, 90), walls: ['0,3,D', 'bad', '0,3,D'] }], walls: ['0,3,D', '0,3,D', 'bad', '1,2', 5, '4,4,R', '-1,0,R', '1,1,X'], hint: '4,4,R' });
  assert.deepEqual(d.walls, ['0,3,D', '4,4,R']);
  assert.deepEqual(d.tries[0].walls, ['0,3,D']);
  assert.equal(d.hint, '4,4,R');
  assert.equal(cleanDay({ tries: [L()], hint: 'junk' }).hint, null);
});

test('parseLineKey', () => {
  assert.deepEqual(parseLineKey('3,4,D'), [3, 4, 'D']);
  assert.equal(parseLineKey('3,4'), null);
  assert.equal(parseLineKey(null), null);
  assert.equal(parseLineKey('3,4,L'), null);
});

test('finishedOn: kept only on a finished day, only if a real date', () => {
  const t = [W(3, 100)];
  assert.equal(cleanDay({ tries: t, done: true, finishedOn: '2026-10-27' }).finishedOn, '2026-10-27');
  assert.equal(cleanDay({ tries: t, done: true, finishedOn: '2026-02-30' }).finishedOn, null);
  assert.equal(cleanDay({ tries: t, done: true, finishedOn: 5 }).finishedOn, null);
  assert.equal(cleanDay({ tries: t, done: false, finishedOn: '2026-10-27' }).finishedOn, null);
});

const day = (o) => cleanDay({ tries: [L()], ...o });

test('mergeDay: the longer tries list wins, and never gets shorter', () => {
  const a = day({ tries: [L(), L()], walls: ['1,1,R'] });
  const b = day({ tries: [L()], walls: ['2,2,R'] });
  assert.equal(mergeDay(a, b).tries.length, 2);
  assert.deepEqual(mergeDay(a, b).walls, ['1,1,R']);
  assert.equal(mergeDay(b, a).tries.length, 2);
});

test('mergeDay: equal tries take the newer (second) walls', () => {
  const m = mergeDay(day({ walls: ['1,1,R'] }), day({ walls: ['2,2,R'] }));
  assert.deepEqual(m.walls, ['2,2,R']);
});

test('mergeDay: done stays set, with its walls, tries and finishedOn', () => {
  const fin = day({ tries: [L(), W(4, 88)], done: true, finishedOn: '2026-10-27', walls: ['1,1,R'] });
  const stale = day({ tries: [L()], walls: ['5,5,R'] });
  for (const m of [mergeDay(fin, stale), mergeDay(stale, fin)]) {
    assert.equal(m.done, true);
    assert.equal(m.finishedOn, '2026-10-27');
    assert.equal(m.tries.length, 2);
    assert.equal(m.tries[1].base, 88);
    assert.deepEqual(m.walls, ['1,1,R']);
  }
});

test('mergeDay: an existing hint and finishedOn are kept', () => {
  assert.equal(mergeDay(day({ hint: '1,1,R' }), day({ tries: [L(), L()] })).hint, '1,1,R');
  assert.equal(mergeDay(day({ tries: [L(), L()] }), day({ hint: '1,1,R' })).hint, '1,1,R');
  const a = day({ tries: [L(), L(), L()], done: true, finishedOn: '2026-10-27' });
  const b = day({ tries: [L(), L(), L()], done: true, finishedOn: '2026-10-28' });
  assert.equal(mergeDay(a, b).finishedOn, '2026-10-27');
});

test('mergeDay: null or missing sides', () => {
  const d = day({ tries: [L(), L()] });
  assert.deepEqual(mergeDay(null, d), d);
  assert.deepEqual(mergeDay(d, undefined), d);
  assert.deepEqual(mergeDay(null, null), freshDay());
});

test('mergeSaved merges per mode and date, seenHowTo if either, the newer lastMode; modes stay apart', () => {
  const a = { ...emptySaved(), lastMode: 'easy', easy: { '2026-10-27': day({ tries: [L(), L()] }), '2026-10-26': day() }, hard: { '2026-10-27': day({ tries: [L()] }) } };
  const b = { ...emptySaved(), seenHowTo: true, lastMode: 'hard', easy: { '2026-10-27': day(), '2026-10-28': day() }, hard: { '2026-10-27': day({ tries: [L(), L()] }) } };
  const m = mergeSaved(a, b);
  assert.equal(m.seenHowTo, true);
  assert.equal(m.lastMode, 'hard');
  assert.deepEqual(Object.keys(m.easy).sort(), ['2026-10-26', '2026-10-27', '2026-10-28']);
  assert.equal(m.easy['2026-10-27'].tries.length, 2);
  assert.equal(m.hard['2026-10-27'].tries.length, 2);
  assert.equal(mergeSaved(a, { ...emptySaved() }).lastMode, 'easy'); // no newer choice: keep the saved one
});

// ---- v1 -> v2 ----

const parOf = (date) => ({ '2026-10-27': 4, '2026-10-28': 4, '2026-10-29': 5, '2026-10-30': 5 })[date] ?? null;
const v1 = (days, seenHowTo = true) => JSON.stringify({ v: 1, seenHowTo, days });

test('migrateV1: nothing to carry gives null', () => {
  for (const raw of [null, '', '{bad', '[]', '{"days":5}']) assert.equal(migrateV1(raw, parOf), null, String(raw));
});

test('migrateV1: a won day becomes one winning try scored (base) from its walls and the par, the hint kept', () => {
  const s = migrateV1(v1({
    '2026-10-27': { tries: 2, won: true, stars: 3, walls: ['0,0,R', '1,1,R', '2,2,R', '3,3,R'], hint: null, done: true, finishedOn: '2026-10-27' },
    '2026-10-28': { tries: 1, won: true, stars: 2, walls: ['0,0,R', '1,1,R', '2,2,R', '3,3,R', '4,4,R'], hint: '4,4,R', done: true, finishedOn: '2026-10-29' },
  }), parOf);
  assert.deepEqual(s.easy, {});
  const a = s.hard['2026-10-27'];
  assert.equal(a.tries.length, 1);
  assert.deepEqual([a.tries[0].won, a.tries[0].fences, a.tries[0].base], [true, 4, 100]); // par 4, 4 fences
  assert.equal(a.done, true);
  assert.equal(a.finishedOn, '2026-10-27');
  const b = s.hard['2026-10-28'];
  assert.deepEqual([b.tries[0].fences, b.tries[0].base], [5, 91]); // par 4, 5 fences: the base. The hint docks it when shown
  assert.equal(bestScore(b.tries, b.hint !== null), 76);
  assert.equal(b.hint, '4,4,R');
  assert.equal(b.finishedOn, '2026-10-29'); // an archive catch-up stays one
  assert.equal(s.seenHowTo, true);
  assert.equal(s.lastMode, 'hard'); // v1 players open on Hard the first time
});

test('migrateV1: a lost day keeps all its lost tries (score 0); an unfinished day keeps the tries it spent', () => {
  const s = migrateV1(v1({
    '2026-10-27': { tries: 3, won: false, stars: 0, walls: ['0,0,R'], hint: null, done: true, finishedOn: '2026-10-27' },
    '2026-10-28': { tries: 2, won: false, walls: ['0,0,R'], hint: '0,0,R', done: false, finishedOn: null },
    '2026-10-29': { tries: 0, won: false, walls: [], hint: null, done: false },
  }), parOf);
  assert.equal(s.hard['2026-10-27'].tries.length, 3);
  assert.ok(s.hard['2026-10-27'].tries.every((t) => !t.won && t.base === 0));
  assert.equal(s.hard['2026-10-27'].done, true);
  assert.equal(s.hard['2026-10-28'].tries.length, 2);
  assert.equal(s.hard['2026-10-28'].done, false);
  assert.equal(s.hard['2026-10-28'].hint, '0,0,R');
  assert.equal('2026-10-29' in s.hard, false, 'an untouched day is not carried');
});

test('migrateV1: days outside the batch and bad dates are dropped; a win with a corrupt wall list still migrates', () => {
  const s = migrateV1(v1({ '2020-01-01': { tries: 1, won: true, done: true }, nope: { tries: 1 }, '2026-10-30': { tries: 1, won: true, walls: 'x', done: true } }), parOf);
  assert.deepEqual(Object.keys(s.hard), ['2026-10-30']);
  assert.equal(s.hard['2026-10-30'].tries[0].base, 100);
});

// ---- base scores, the hint, reviewing ----

test('cleanDay: a try from the first v2 build (score only, already docked) gets its base back, once', () => {
  const old = { tries: [{ fences: 3, won: true, score: 85 }, { fences: 5, won: true, score: 62 }, { fences: 4, won: false, score: 0 }], hint: '1,1,R' };
  const d = cleanDay(old);
  assert.deepEqual(d.tries.map((t) => t.base), [100, 77, 0]);
  assert.equal(bestScore(d.tries, true), 85);
  assert.deepEqual(cleanDay(d).tries, d.tries, 'cleaning again changes nothing');
  assert.equal(cleanDay({ tries: [{ fences: 3, won: true, score: 100 }] }).tries[0].base, 100); // no hint: the score is the base
  assert.equal(cleanDay({ tries: [{ fences: 3, won: true, score: 95 }], hint: '1,1,R' }).tries[0].base, 100); // capped
});

test('a hint used after a win survives a save and a merge, in either order', () => {
  const won = { tries: [W(3, 100)], hint: null, walls: ['0,0,R'] };
  const hinted = { ...won, hint: '1,1,R', walls: ['0,0,R', '1,1,R'] };
  for (const m of [mergeDay(won, hinted), mergeDay(hinted, won), mergeDay(hinted, hinted)]) {
    assert.equal(m.hint, '1,1,R');
    assert.equal(m.tries[0].base, 100);
    assert.equal(bestScore(m.tries, m.hint !== null), 85);
  }
  const s = parseSaved(serialize({ ...emptySaved(), easy: { '2026-10-27': hinted } }));
  assert.equal(bestScore(s.easy['2026-10-27'].tries, s.easy['2026-10-27'].hint !== null), 85);
});

test('reviewing: kept for a win being decided, cleared by Retry, never set on a done day or a loss', () => {
  const rev = cleanDay({ tries: [W(3, 100)] });
  assert.equal(rev.reviewing, true, 'an older save with a last win is read as reviewing');
  assert.equal(cleanDay({ tries: [W(3, 100)], reviewing: false }).reviewing, false);
  assert.equal(cleanDay({ tries: [L()], reviewing: true }).reviewing, false);
  assert.equal(cleanDay({ tries: [W(3, 100)], done: true, finishedOn: '2026-10-27', reviewing: true }).reviewing, false);
  // Retry pressed in the newer copy with equal tries: editing wins; a copy with more tries decides otherwise
  assert.equal(mergeDay({ tries: [W(3, 100)] }, { tries: [W(3, 100)], reviewing: false }).reviewing, false);
  assert.equal(mergeDay({ tries: [W(3, 100), W(4, 88)] }, { tries: [W(3, 100)], reviewing: false }).reviewing, true);
});
