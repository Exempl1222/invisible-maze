import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareText, pageUrl } from '../assets/js/daily/share.js';

const URL = 'https://exempl1222.github.io/invisible-maze/daily/?mode=hard';
const W = { won: true };
const L = { won: false };
const base = { number: 1, mode: 'hard', url: URL, score: 82, tries: [L, W, W], hint: true, archive: false };

test('the spec example matches exactly', () => {
  assert.equal(shareText(base), ['Gnome Sweet Gnome #1 Hard 🍄', '82/100 💡', '🟥🟩🟩', URL].join('\n'));
});

test('Easy names its mode, and one try is one square', () => {
  const t = shareText({ ...base, mode: 'easy', url: URL.replace('hard', 'easy'), score: 100, tries: [W], hint: false });
  assert.equal(t, ['Gnome Sweet Gnome #1 Easy 🍄', '100/100', '🟩', 'https://exempl1222.github.io/invisible-maze/daily/?mode=easy'].join('\n'));
});

test('the bulb only shows when the hint was used', () => {
  assert.equal(shareText({ ...base, hint: false }).split('\n')[1], '82/100');
  assert.equal(shareText({ ...base, hint: true }).split('\n')[1], '82/100 💡');
});

test('a day with no win reads 0/100 with a house, all red squares', () => {
  const t = shareText({ ...base, score: 0, tries: [L, L, L], hint: false });
  assert.equal(t.split('\n')[1], '0/100 🏠');
  assert.equal(t.split('\n')[2], '🟥🟥🟥');
  assert.equal(shareText({ ...base, score: 0, tries: [L, L, L], hint: true }).split('\n')[1], '0/100 🏠 💡');
});

test('squares follow the tries in order, including a win then a worse win', () => {
  assert.equal(shareText({ ...base, tries: [W, L] }).split('\n')[2], '🟩🟥');
  assert.equal(shareText({ ...base, tries: [L, L, W] }).split('\n')[2], '🟥🟥🟩');
});

test('an archive day keeps (archive) after the number', () => {
  assert.equal(shareText({ ...base, number: 12, archive: true }).split('\n')[0], 'Gnome Sweet Gnome #12 (archive) Hard 🍄');
});

test('no par, fences or stars in the text', () => {
  const t = shareText(base);
  assert.doesNotMatch(t, /par|fence|⭐/i);
});

test('pageUrl strips the query and hash, then adds the mode', () => {
  assert.equal(pageUrl('https://x.github.io/invisible-maze/daily/?date=2026-10-27#a', 'easy'), 'https://x.github.io/invisible-maze/daily/?mode=easy');
  assert.equal(pageUrl('https://x.github.io/invisible-maze/daily/?mode=easy&date=2026-10-27', 'hard'), 'https://x.github.io/invisible-maze/daily/?mode=hard');
  assert.equal(pageUrl('https://x.github.io/invisible-maze/daily/?date=2026-10-27'), 'https://x.github.io/invisible-maze/daily/');
});
