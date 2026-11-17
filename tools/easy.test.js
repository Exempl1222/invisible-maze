import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLevel, findPath, solve, countAnswers, simulate, cutsAllRoutes, capViolation } from '../src/game/index.js';
import { invalidBridges } from './generate.js';
import { buildEasy } from './build-easy.js';

const read = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));
const easy = read('../assets/levels/easy.json');
const pack = read('../assets/levels/pack-01.json');
const L = easy.levels;
const has = (l, re) => l.tiles.some((r) => re.test(r));
const GROUPS = [[6, 9, [2, 2]], [10, 13, [2, 3]], [14, 17, [3, 3]], [18, 20, [3, 4]]]; // [from, to, [minPar, maxPar]]
const wins = (raw, tiles, answer) => {
  const lv = parseLevel({ ...raw, tiles });
  return !cutsAllRoutes(lv, answer) && simulate(lv, answer).result === 'win';
};

test('easy: shape, 20 levels, ids in order, 5x5, rules v4, budget par + 2', () => {
  assert.equal(easy.id, 'easy');
  assert.equal(L.length, 20);
  L.forEach((l, i) => {
    assert.equal(l.id, `easy-${String(i + 1).padStart(2, '0')}`);
    assert.equal(l.size, 5);
    assert.equal(l.rules, 'v4');
    assert.equal(l.wallBudget, l.par + 2, `${l.id} budget`);
  });
});

test('easy 1 to 5 are the pack 1 tutorial, unchanged boards and answers', () => {
  L.slice(0, 5).forEach((l, i) => {
    const { id, ...a } = l;
    const { id: _id, ...b } = pack.levels[i];
    assert.deepEqual(a, b, l.id);
  });
});

test('easy: every level is consistent with the engine and its stored answer wins', () => {
  for (const raw of L) {
    const lv = parseLevel(raw);
    const s = solve(lv);
    assert.equal(raw.par, s.par, `${raw.id} par`);
    assert.equal(raw.parAnswers, countAnswers(lv, s.par, 50), `${raw.id} parAnswers`);
    assert.equal(simulate(lv, []).result, 'lose', `${raw.id} gnome wins with no walls`);
    assert.equal(raw.answer.length, raw.par, `${raw.id} answer length`);
    assert.equal(capViolation(lv, raw.answer), null, `${raw.id} side cap`);
    assert.equal(cutsAllRoutes(lv, raw.answer), false, `${raw.id} leaves a route`);
    const r = simulate(lv, raw.answer);
    assert.equal(r.result, 'win', `${raw.id} stored answer wins`);
    assert.equal(r.reason, 'too-far', raw.id);
  }
});

test('easy: par ramp, slack, parAnswers, order', () => {
  for (const [from, to, [lo, hi]] of GROUPS) {
    const g = L.slice(from - 1, to);
    for (const l of g) assert.ok(l.par >= lo && l.par <= hi, `${l.id} par ${l.par}`);
    for (let i = 1; i < g.length; i++) assert.ok(g[i].par >= g[i - 1].par, `${g[i].id} par decreases`);
  }
  assert.deepEqual(L.slice(5, 9).map((l) => l.par), [2, 2, 2, 2]);
  assert.deepEqual(L.slice(13, 17).map((l) => l.par), [3, 3, 3, 3]);
  assert.equal(L[19].par, 4);
  L.slice(5).forEach((l) => {
    const slack = l.moveLimit - (findPath(parseLevel(l), []).positions.length - 1);
    assert.ok(slack >= 2 && slack <= 5, `${l.id} slack ${slack}`);
  });
  L.slice(5, 13).forEach((l) => assert.ok(l.parAnswers <= 10, `${l.id} parAnswers ${l.parAnswers}`));
});

test('easy: each band teaches its idea and the idea is load-bearing', () => {
  L.slice(5, 9).forEach((l) => {
    assert.ok(has(l, /#/), `${l.id} has rocks`);
    assert.ok(!has(l, /[~=a-z]/), `${l.id} has no river or teleporter`);
  });
  L.slice(9, 13).forEach((l) => {
    assert.ok(has(l, /~/) && has(l, /=/), `${l.id} has a river with bridges`);
    assert.ok(!has(l, /[a-z]/), `${l.id} has no teleporter`);
    assert.ok(!wins(l, l.tiles.map((r) => r.replace(/[~=]/g, '.')), l.answer), `${l.id} answer still wins with the river removed`);
    const lv = parseLevel(l);
    assert.ok(l.answer.some(([x, y, d]) => lv.tile(x, y) === '=' || lv.tile(d === 'R' ? x + 1 : x, d === 'D' ? y + 1 : y) === '='), `${l.id} answer fences a bridge end`);
  });
  L.slice(13, 17).forEach((l) => {
    assert.ok(has(l, /[a-z]/), `${l.id} has a teleporter pair`);
    assert.ok(!wins(l, l.tiles.map((r) => r.replace(/[a-z]/g, '.')), l.answer), `${l.id} answer still wins with grass for teleporters`);
  });
  L.slice(17).forEach((l) => assert.ok(has(l, /[~=]/) || has(l, /[a-z]/), `${l.id} mixes ideas`));
});

test('easy: bridges span rivers, no duplicate boards', () => {
  for (const l of L) assert.deepEqual(invalidBridges(l.tiles), [], l.id);
  assert.equal(new Set(L.map((l) => l.tiles.join('/'))).size, 20);
});

test('easy: the shipped file is what the build makes (deterministic)', () => {
  assert.deepEqual(buildEasy(), easy);
});
