import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLevel, findPath, solve, countAnswers, simulate, cutsAllRoutes, capViolation } from '../src/game/index.js';
import { invalidBridges } from './generate.js';
import { slideLinesInAnswer } from './build-lab-v5.js';
import { buildMedium, lookAlike, BOARDS } from './build-medium.js';

const medium = JSON.parse(readFileSync(fileURLToPath(new URL('../assets/levels/medium.json', import.meta.url)), 'utf8'));
const L = medium.levels;
const MECH = { ice: '*', mud: '&', gate: '><^v' };
const mechsOf = (l) => Object.keys(MECH).filter((m) => [...MECH[m]].some((c) => l.tiles.join('').includes(c)));
const count = (l, chars) => [...l.tiles.join('')].filter((c) => chars.includes(c)).length;
const slack = (l) => l.moveLimit - (findPath(parseLevel(l), []).positions.length - 1);
const KINDS = [...Array(5).fill(['ice']), ...Array(5).fill(['mud']), ...Array(4).fill(['gate'])];

test('medium: shape, 20 levels medium-01 to medium-20, 7x7, rules v5, budget par + 2, stored par', () => {
  assert.equal(medium.id, 'medium');
  assert.equal(L.length, 20);
  assert.equal(BOARDS.length, 20);
  L.forEach((l, i) => {
    assert.equal(l.id, `medium-${String(i + 1).padStart(2, '0')}`);
    assert.equal(l.size, 7);
    assert.equal(l.rules, 'v5');
    assert.equal(l.wallBudget, l.par + 2, `${l.id} budget`);
  });
});

test('medium: par ramp 3,3,3,3,4 | 3,3,4,4,4 | 4,4,4,4 | 4,4,4,5,5,5', () => {
  assert.deepEqual(L.map((l) => l.par), [3, 3, 3, 3, 4, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5]);
});

test('medium: ice 21-25, mud 26-30, gates 31-34, then mixes of at least two mechanics', () => {
  KINDS.forEach((k, i) => assert.deepEqual(mechsOf(L[i]), k, L[i].id));
  L.slice(14).forEach((l) => assert.ok(mechsOf(l).length >= 2, `${l.id} mixes: ${mechsOf(l)}`));
});

test('medium: intro levels 21, 26, 31 have no river, bridges or teleporters, and at most 10 par answers', () => {
  for (const i of [0, 5, 10]) {
    assert.ok(!/[~=a-z]/.test(L[i].tiles.join('').replace(/v/g, '')), `${L[i].id} has no river, bridge or teleporter`);
    assert.ok(L[i].parAnswers <= 10, `${L[i].id} parAnswers ${L[i].parAnswers}`);
  }
  assert.deepEqual(L.slice(0, 5).map((l) => mechsOf(l)).flat().filter((m) => m !== 'ice'), []);
});

test('medium: every level is consistent with the engine and its stored answer wins', () => {
  for (const raw of L) {
    const lv = parseLevel(raw);
    const s = solve(lv, { maxPar: raw.par, maxNodes: 2e6 });
    assert.ok(s, `${raw.id} solves`);
    assert.equal(raw.par, s.par, `${raw.id} par`);
    assert.equal(raw.parAnswers, countAnswers(lv, s.par, 50, { maxNodes: 2e6 }), `${raw.id} parAnswers`);
    assert.ok(raw.parAnswers >= 1 && raw.parAnswers <= 50, raw.id);
    assert.equal(simulate(lv, []).result, 'lose', `${raw.id} gnome wins with no fences`);
    assert.equal(raw.answer.length, raw.par, `${raw.id} answer length`);
    assert.equal(capViolation(lv, raw.answer), null, `${raw.id} side cap`);
    const r = simulate(lv, raw.answer);
    assert.equal(r.result, 'win', `${raw.id} stored answer wins`);
    assert.equal(r.reason, 'too-far', raw.id);
  }
});

test('medium: slack 3 to 7 and density (ice 3 to 8, mud 2 to 5, gates 1 to 3)', () => {
  for (const l of L) {
    assert.ok(slack(l) >= 3 && slack(l) <= 7, `${l.id} slack ${slack(l)}`);
    if (mechsOf(l).includes('ice')) assert.ok(count(l, '*') >= 3 && count(l, '*') <= 8, `${l.id} ice ${count(l, '*')}`);
    if (mechsOf(l).includes('mud')) assert.ok(count(l, '&') >= 2 && count(l, '&') <= 5, `${l.id} mud ${count(l, '&')}`);
    if (mechsOf(l).includes('gate')) assert.ok(count(l, '><^v') >= 1 && count(l, '><^v') <= 3, `${l.id} gates ${count(l, '><^v')}`);
  }
});

test('medium: the stored answer is placeable in its stored order (no prefix cuts every route)', () => {
  for (const raw of L) {
    const lv = parseLevel(raw);
    for (let k = 1; k <= raw.answer.length; k++) {
      const prefix = raw.answer.slice(0, k);
      assert.equal(cutsAllRoutes(lv, prefix), false, `${raw.id} prefix of ${k} cuts every route`);
      assert.equal(capViolation(lv, prefix), null, `${raw.id} prefix of ${k} breaks the side cap`);
    }
  }
});

test('medium: every mechanic is load-bearing (100% on 21 to 34, at least 70% across the tier)', () => {
  let present = 0, bearing = 0;
  L.forEach((raw, i) => {
    for (const m of mechsOf(raw)) {
      const tiles = raw.tiles.map((row) => [...row].map((c) => (MECH[m].includes(c) ? '.' : c)).join(''));
      const lv = parseLevel({ ...raw, tiles });
      let wins = false;
      try { wins = !cutsAllRoutes(lv, raw.answer) && simulate(lv, raw.answer).result === 'win'; } catch { wins = false; }
      const changed = !wins || solve(lv, { maxPar: raw.par - 1, maxNodes: 2e6 }) !== null;
      present++;
      if (changed) bearing++;
      else assert.ok(i >= 14, `${raw.id}: ${m} is not load-bearing`);
    }
  });
  assert.ok(bearing / present >= 0.7, `load-bearing ${bearing}/${present}`);
});

test('medium: at least 2 ice levels fence across a slide; on every gate level the gnome passes a gate when the answer is played', () => {
  const slides = L.filter((l) => mechsOf(l).includes('ice') && slideLinesInAnswer(parseLevel(l), l.answer).length > 0);
  assert.ok(slides.length >= 2, `${slides.length} ice levels with a fence across a slide`);
  for (const l of L.filter((x) => mechsOf(x).includes('gate'))) {
    const lv = parseLevel(l);
    const steps = simulate(lv, l.answer).steps;
    assert.ok(steps.some(([x, y]) => '><^v'.includes(lv.tile(x, y))), `${l.id}: the route passes no gate`);
  }
});

test('medium: par answers at most 20 (12 on 35-40, 5 on 40, 10 on intros); ice is seen sliding in the stored answer', () => {
  L.forEach((l, i) => {
    const cap = [0, 5, 10].includes(i) ? 10 : i === 19 ? 5 : i >= 14 ? 12 : 20;
    assert.ok(l.parAnswers <= cap, `${l.id} parAnswers ${l.parAnswers} > ${cap}`);
    if (mechsOf(l).includes('ice')) {
      const trails = simulate(parseLevel(l), l.answer).trails || [];
      assert.ok(trails.some((t) => t.length >= 2), `${l.id}: no slide in the stored answer's replay`);
    }
  });
});

test('medium: the mechanic decides par (ice, mud and gates to grass changes par) on 21, 26, 31 and at least 15 of 20', () => {
  let decide = 0;
  const failed = [];
  L.forEach((raw, i) => {
    const tiles = raw.tiles.map((row) => [...row].map((c) => ('*&><^v'.includes(c) ? '.' : c)).join(''));
    const grass = parseLevel({ ...raw, tiles });
    const s = solve(grass, { maxPar: raw.par });
    const changed = s === null || s.par !== raw.par;
    if (changed) decide++;
    else failed.push(i + 21);
  });
  for (const n of [21, 26, 31]) assert.ok(!failed.includes(n), `${n}: par unchanged without the mechanic`);
  assert.ok(decide >= 15, `mechanic decides par on ${decide} of 20; unchanged on ${failed}`);
});

test('medium: bridges span rivers, no duplicate boards, no look-alikes within a group', () => {
  for (const l of L) assert.deepEqual(invalidBridges(l.tiles), [], l.id);
  assert.equal(new Set(L.map((l) => l.tiles.join('/'))).size, 20);
  for (const [from, to] of [[0, 4], [5, 9], [10, 13], [14, 19]]) {
    for (let a = from; a <= to; a++) for (let b = a + 1; b <= to; b++) assert.equal(lookAlike(L[a].tiles, L[b].tiles), false, `${L[a].id} looks like ${L[b].id}`);
  }
});

test('medium: the shipped file is what the build makes (deterministic) and the build is quick', () => {
  const t0 = Date.now();
  assert.deepEqual(buildMedium().pack, medium);
  assert.ok(Date.now() - t0 < 120000, 'default build under 2 minutes');
});
