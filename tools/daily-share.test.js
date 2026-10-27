import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareText, pageUrl } from '../assets/js/daily/share.js';

const URL = 'https://exempl1222.github.io/invisible-maze/daily/';
const base = { number: 1, url: URL, par: 4, walls: 4, tries: 2, won: true, stars: 3, hint: false };

test('a win on try 2 matches the spec format exactly', () => {
  assert.equal(shareText(base), [
    'Gnome Sweet Gnome #1 🍄',
    '⭐⭐⭐ 4 fences (par 4)',
    '🟥🟩 2/3',
    URL,
  ].join('\n'));
});

test('a win on try 1 has a single green square', () => {
  assert.equal(shareText({ ...base, tries: 1 }).split('\n')[2], '🟩 1/3');
});

test('a win on try 3', () => {
  assert.equal(shareText({ ...base, tries: 3 }).split('\n')[2], '🟥🟥🟩 3/3');
});

test('stars follow the result, and one fence is singular', () => {
  assert.equal(shareText({ ...base, stars: 2, walls: 5 }).split('\n')[1], '⭐⭐ 5 fences (par 4)');
  assert.equal(shareText({ ...base, stars: 1, walls: 1, par: 1 }).split('\n')[1], '⭐ 1 fence (par 1)');
});

test('hint used appends the bulb to the star line only', () => {
  const lines = shareText({ ...base, hint: true, stars: 2 }).split('\n');
  assert.equal(lines[1], '⭐⭐ 4 fences (par 4) 💡');
  assert.equal(lines[2], '🟥🟩 2/3');
});

test('a lost day', () => {
  assert.equal(shareText({ ...base, won: false, tries: 3, stars: 0 }), [
    'Gnome Sweet Gnome #1 🍄',
    '🏠 He made it home',
    '🟥🟥🟥 X/3',
    URL,
  ].join('\n'));
});

test('a lost day with a hint', () => {
  const lines = shareText({ ...base, won: false, tries: 3, hint: true }).split('\n');
  assert.equal(lines[1], '🏠 He made it home 💡');
});

test('the daily number is used', () => {
  assert.equal(shareText({ ...base, number: 42 }).split('\n')[0], 'Gnome Sweet Gnome #42 🍄');
});

test('pageUrl drops the query string and hash', () => {
  assert.equal(pageUrl('https://exempl1222.github.io/invisible-maze/daily/?date=2026-10-28#x'), URL);
  assert.equal(pageUrl(URL), URL);
  assert.equal(pageUrl('http://localhost:4173/daily/?date=2026-10-27'), 'http://localhost:4173/daily/');
});

test('an archive day says (archive) after the number', () => {
  const t = shareText({ number: 3, url: 'https://x/daily/', par: 4, walls: 4, tries: 1, won: true, stars: 3, hint: false, archive: true });
  assert.equal(t.split('\n')[0], 'Gnome Sweet Gnome #3 (archive) 🍄');
  assert.equal(shareText({ number: 3, url: 'u', par: 4, walls: 4, tries: 1, won: true, stars: 3, hint: false }).split('\n')[0], 'Gnome Sweet Gnome #3 🍄');
});
