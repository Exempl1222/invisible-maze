import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardModel, cardFileName } from '../assets/js/daily/card.js';

const W = { won: true };
const L = { won: false };
const base = { number: 7, mode: 'hard', score: 82, tries: [L, W, W], hint: true, archive: false, beat: null, streak: 0 };

test('a win with a hint: strings, squares in order, caption and toad', () => {
  const m = cardModel({ ...base, beat: 64, streak: 3 });
  assert.equal(m.wordmark, 'Gnome Sweet Gnome');
  assert.equal(m.title, '#7 Hard');
  assert.equal(m.score, '82/100');
  assert.equal(m.hint, true);
  assert.deepEqual(m.squares.map((s) => s.color), ['#c94a32', '#3f7a34', '#3f7a34']);
  assert.deepEqual(m.squares.map((s) => s.won), [false, true, true]);
  assert.equal(m.caption, 'Fenced in.');
  assert.equal(m.beat, 'Beat 64% of players');
  assert.equal(m.streak, '3-day streak');
  assert.equal(m.toad, 'toad-front-point');
  assert.equal(m.footer, 'gnomesweetgnome.app');
  assert.equal(m.fileName, 'gnome-sweet-gnome-7-hard.png');
});

test('a perfect 100 on the first try', () => {
  const m = cardModel({ ...base, mode: 'easy', score: 100, tries: [W], hint: false });
  assert.equal(m.title, '#7 Easy');
  assert.equal(m.score, '100/100');
  assert.equal(m.hint, false);
  assert.equal(m.squares.length, 1);
  assert.equal(m.caption, 'Fenced in perfectly.');
  assert.equal(m.toad, 'toad-front-point');
});

test('a day with no win: 0, five red squares, he made it home, the smug toad', () => {
  const m = cardModel({ ...base, score: 0, tries: [L, L, L, L, L], hint: false });
  assert.equal(m.score, '0/100');
  assert.equal(m.squares.length, 5);
  assert.ok(m.squares.every((s) => s.color === '#c94a32'));
  assert.equal(m.caption, 'He made it home.');
  assert.equal(m.toad, 'toad-front-smug');
});

test('caption boundaries: 1 and 99 are Fenced in, not perfect', () => {
  assert.equal(cardModel({ ...base, score: 1 }).caption, 'Fenced in.');
  assert.equal(cardModel({ ...base, score: 99 }).caption, 'Fenced in.');
});

test('archive days add (archive) and never show a streak', () => {
  const m = cardModel({ ...base, archive: true, streak: 9 });
  assert.equal(m.title, '#7 (archive) Hard');
  assert.equal(m.streak, null);
});

test('the streak shows from 2 up only', () => {
  assert.equal(cardModel({ ...base, streak: 0 }).streak, null);
  assert.equal(cardModel({ ...base, streak: 1 }).streak, null);
  assert.equal(cardModel({ ...base, streak: 2 }).streak, '2-day streak');
  assert.equal(cardModel({ ...base, streak: 41 }).streak, '41-day streak');
  assert.equal(cardModel({ ...base, streak: undefined }).streak, null);
});

test('the beat line appears exactly when the share text has it', () => {
  assert.equal(cardModel({ ...base, beat: null }).beat, null);
  assert.equal(cardModel({ ...base, beat: undefined }).beat, null);
  assert.equal(cardModel({ ...base, beat: 0 }).beat, 'Beat 0% of players');
  assert.equal(cardModel({ ...base, beat: 100 }).beat, 'Beat 100% of players');
  assert.equal(cardModel({ ...base, beat: 101 }).beat, null);
  assert.equal(cardModel({ ...base, beat: 12.5 }).beat, null);
});

test('file name per number and mode', () => {
  assert.equal(cardFileName(12, 'easy'), 'gnome-sweet-gnome-12-easy.png');
});
