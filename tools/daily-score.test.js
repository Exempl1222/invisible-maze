import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFor, shownScore, bestScore, maxScore, bandOf, BANDS, HINT_COST } from '../assets/js/daily/score.js';

test('par scores 100, one over par on par 3 is 88, 3x par or more is the floor of 30', () => {
  assert.equal(scoreFor(3, 3), 100);
  assert.equal(scoreFor(4, 3), 88);
  assert.equal(scoreFor(5, 3), 77);
  assert.equal(scoreFor(9, 3), 30);
  assert.equal(scoreFor(40, 3), 30);
  assert.equal(scoreFor(4, 4), 100);
  assert.equal(scoreFor(5, 4), 91);
  assert.equal(scoreFor(6, 4), 83);
  assert.equal(scoreFor(12, 4), 30);
});

test('the formula matches max(30, round(100 - 70 * (f - p) / (2p))) for every par 3 to 6 and f up to 3p + 4', () => {
  for (let p = 3; p <= 6; p++) {
    for (let f = p; f <= 3 * p + 4; f++) {
      assert.equal(scoreFor(f, p), Math.max(30, Math.round(100 - (70 * (f - p)) / (2 * p))), `par ${p}, ${f} fences`);
    }
  }
});

test('fewer fences than par is read as par', () => {
  assert.equal(scoreFor(2, 3), 100);
  assert.equal(scoreFor(0, 4), 100);
});

test('the score never rises as fences are added', () => {
  for (const p of [3, 4]) {
    let prev = 101;
    for (let f = p; f < 4 * p; f++) {
      const s = scoreFor(f, p);
      assert.ok(s <= prev, `par ${p}, ${f} fences`);
      prev = s;
    }
  }
});

test('the hint takes 15 off the base at read time, floor 15', () => {
  assert.equal(HINT_COST, 15);
  const w = (base) => ({ won: true, base });
  assert.equal(shownScore(w(100), true), 85);
  assert.equal(shownScore(w(88), true), 73);
  assert.equal(shownScore(w(30), true), 15);
  assert.equal(shownScore(w(30), false), 30);
  assert.equal(shownScore({ won: false, base: 0 }, true), 0);
  assert.equal(maxScore(false), 100);
  assert.equal(maxScore(true), 85);
});

test('bestScore: the best winning try as shown, 0 with no win, the hint docked once', () => {
  assert.equal(bestScore([]), 0);
  assert.equal(bestScore(undefined), 0);
  assert.equal(bestScore([{ won: false, base: 0 }, { won: false, base: 0 }]), 0);
  const tries = [{ won: true, base: 65 }, { won: true, base: 82 }, { won: false, base: 0 }];
  assert.equal(bestScore(tries, false), 82);
  assert.equal(bestScore(tries, true), 67);
  assert.equal(bestScore([...tries].reverse(), true), 67);
});

test('bands: 100, 80 to 99, 60 to 79, 30 to 59, 1 to 29, 0', () => {
  assert.deepEqual(BANDS.map((b) => b.key), ['100', '80', '60', '30', '1', '0']);
  const at = [[100, '100'], [99, '80'], [80, '80'], [79, '60'], [60, '60'], [59, '30'], [30, '30'], [29, '1'], [15, '1'], [1, '1'], [0, '0']];
  for (const [score, key] of at) assert.equal(bandOf(score), key, String(score));
});
