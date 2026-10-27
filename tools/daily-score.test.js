import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFor, bestScore, dockWins, bandOf, BANDS, HINT_COST } from '../assets/js/daily/score.js';

test('par scores 100, one over par on par 3 is 88, 3x par or more is the floor of 30', () => {
  assert.equal(scoreFor(3, 3, false), 100);
  assert.equal(scoreFor(4, 3, false), 88);
  assert.equal(scoreFor(5, 3, false), 77);
  assert.equal(scoreFor(9, 3, false), 30);
  assert.equal(scoreFor(40, 3, false), 30);
  assert.equal(scoreFor(4, 4, false), 100);
  assert.equal(scoreFor(5, 4, false), 91);
  assert.equal(scoreFor(6, 4, false), 83);
  assert.equal(scoreFor(12, 4, false), 30);
});

test('the formula matches max(30, round(100 - 70 * (f - p) / (2p))) for every par 3 to 6 and f up to 3p + 4', () => {
  for (let p = 3; p <= 6; p++) {
    for (let f = p; f <= 3 * p + 4; f++) {
      assert.equal(scoreFor(f, p, false), Math.max(30, Math.round(100 - (70 * (f - p)) / (2 * p))), `par ${p}, ${f} fences`);
    }
  }
});

test('fewer fences than par is read as par', () => {
  assert.equal(scoreFor(2, 3, false), 100);
  assert.equal(scoreFor(0, 4, false), 100);
});

test('the score never rises as fences are added', () => {
  for (const p of [3, 4]) {
    let prev = 101;
    for (let f = p; f < 4 * p; f++) {
      const s = scoreFor(f, p, false);
      assert.ok(s <= prev, `par ${p}, ${f} fences`);
      prev = s;
    }
  }
});

test('the hint takes 15 off after the floor, so the lowest hinted win is 15', () => {
  assert.equal(HINT_COST, 15);
  assert.equal(scoreFor(3, 3, true), 85);
  assert.equal(scoreFor(4, 3, true), 73);
  assert.equal(scoreFor(9, 3, true), 15);
  assert.equal(scoreFor(30, 3, true), 15);
});

test('bestScore: the best winning try, 0 with no win', () => {
  assert.equal(bestScore([]), 0);
  assert.equal(bestScore(undefined), 0);
  assert.equal(bestScore([{ won: false, score: 0 }, { won: false, score: 0 }]), 0);
  assert.equal(bestScore([{ won: true, score: 65 }, { won: true, score: 82 }, { won: false, score: 0 }]), 82);
  assert.equal(bestScore([{ won: true, score: 82 }, { won: true, score: 65 }]), 82);
});

test('dockWins takes 15 off every winning try and leaves losses and the input alone', () => {
  const tries = [{ fences: 5, won: true, score: 77 }, { fences: 4, won: false, score: 0 }, { fences: 3, won: true, score: 100 }];
  const out = dockWins(tries);
  assert.deepEqual(out.map((t) => t.score), [62, 0, 85]);
  assert.equal(tries[0].score, 77);
  assert.equal(dockWins([{ won: true, score: 30 }])[0].score, 15);
});

test('bands: 100, 80 to 99, 60 to 79, 30 to 59, 1 to 29, 0', () => {
  assert.deepEqual(BANDS.map((b) => b.key), ['100', '80', '60', '30', '1', '0']);
  const at = [[100, '100'], [99, '80'], [80, '80'], [79, '60'], [60, '60'], [59, '30'], [30, '30'], [29, '1'], [15, '1'], [1, '1'], [0, '0']];
  for (const [score, key] of at) assert.equal(bandOf(score), key, String(score));
});
