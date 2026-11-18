import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLevel, findPath, solve, countAnswers, simulate, cutsAllRoutes, capViolation } from '../src/game/index.js';
import { invalidBridges } from './generate.js';
import { buildHard, lookAlike, BOARDS } from './build-hard.js';

const hard = JSON.parse(readFileSync(fileURLToPath(new URL('../assets/levels/hard.json', import.meta.url)), 'utf8'));
const L = hard.levels;
const MECH = { ice: '*', mud: '&', gate: '><^v' };
const mechsOf = (l) => Object.keys(MECH).filter((m) => [...MECH[m]].some((c) => l.tiles.join('').includes(c)));
const count = (l, chars) => [...l.tiles.join('')].filter((c) => chars.includes(c)).length;
const slack = (l) => l.moveLimit - (findPath(parseLevel(l), []).positions.length - 1);
const TOOLS = [...Array(5).fill('ladder'), ...Array(5).fill('pickaxe'), ...Array(5).fill('plank')];
const NODES = 2e6;

test('hard: shape, 20 levels hard-01 to hard-20, 9x9, rules v5, a tool on each, budget par + 2, stored par', () => {
  assert.equal(hard.id, 'hard');
  assert.equal(L.length, 20);
  assert.equal(BOARDS.length, 20);
  L.forEach((l, i) => {
    assert.equal(l.id, `hard-${String(i + 1).padStart(2, '0')}`);
    assert.equal(l.size, 9);
    assert.equal(l.rules, 'v5');
    assert.ok(['ladder', 'pickaxe', 'plank'].includes(l.tool), l.id);
    assert.equal(l.wallBudget, l.par + 2, `${l.id} budget`);
  });
});

test('hard: tools ladder 41-45, pickaxe 46-50, plank 51-55; par ramp 4,4,5,5,5 | 4,5,5,5,6 | 5,5,5,6,6 | 5,6,6,6,7', () => {
  TOOLS.forEach((t, i) => assert.equal(L[i].tool, t, L[i].id));
  assert.deepEqual(L.map((l) => l.par), [4, 4, 5, 5, 5, 4, 5, 5, 5, 6, 5, 5, 5, 6, 6, 5, 6, 6, 6, 7]);
  for (const i of [0, 5, 10]) assert.deepEqual(mechsOf(L[i]), [], `${L[i].id} has only its tool`);
  L.slice(15).forEach((l) => assert.ok(mechsOf(l).length >= 1, `${l.id} mixes in a Medium tile`));
});

test('hard: every level is consistent with the engine; its stored answer wins; he has a tool-free route with no fences', () => {
  for (const raw of L) {
    const lv = parseLevel(raw);
    const s = solve(lv, { maxPar: raw.par, maxNodes: NODES });
    assert.ok(s, `${raw.id} solves`);
    assert.equal(raw.par, s.par, `${raw.id} par`);
    assert.equal(raw.parAnswers, countAnswers(lv, s.par, 50, { maxNodes: NODES }), `${raw.id} parAnswers`);
    assert.ok(raw.parAnswers >= 1 && raw.parAnswers <= 50, raw.id);
    assert.equal(simulate(lv, []).result, 'lose', `${raw.id} gnome wins with no fences`);
    assert.notEqual(findPath(lv, []).toolFreeRoute, false, `${raw.id} tool-free route`);
    assert.equal(raw.answer.length, raw.par, `${raw.id} answer length`);
    assert.equal(capViolation(lv, raw.answer), null, `${raw.id} side cap`);
    const r = simulate(lv, raw.answer);
    assert.equal(r.result, 'win', `${raw.id} stored answer wins`);
    assert.equal(r.reason, 'too-far', raw.id);
    assert.notEqual(r.toolStep, null, `${raw.id}: the stored answer's replay uses the ${raw.tool}`);
  }
});

test('hard: slack 5 to 10 and density (ice 3 to 8, mud 2 to 5, gates 1 to 3)', () => {
  for (const l of L) {
    assert.ok(slack(l) >= 5 && slack(l) <= 10, `${l.id} slack ${slack(l)}`);
    if (mechsOf(l).includes('ice')) assert.ok(count(l, '*') >= 3 && count(l, '*') <= 8, `${l.id} ice ${count(l, '*')}`);
    if (mechsOf(l).includes('mud')) assert.ok(count(l, '&') >= 2 && count(l, '&') <= 5, `${l.id} mud ${count(l, '&')}`);
    if (mechsOf(l).includes('gate')) assert.ok(count(l, '><^v') >= 1 && count(l, '><^v') <= 3, `${l.id} gates ${count(l, '><^v')}`);
  }
});

test('hard: the stored answer is placeable in its stored order (no prefix cuts every route or breaks the side cap)', () => {
  for (const raw of L) {
    const lv = parseLevel(raw);
    for (let k = 1; k <= raw.answer.length; k++) {
      const prefix = raw.answer.slice(0, k);
      assert.equal(cutsAllRoutes(lv, prefix), false, `${raw.id} prefix of ${k} cuts every route`);
      assert.equal(capViolation(lv, prefix), null, `${raw.id} prefix of ${k} breaks the side cap`);
    }
  }
});

test('hard: par answers at most 10 on 41, 46, 51; 20 on any level; 12 on 56 to 60; 5 on 60', () => {
  L.forEach((l, i) => {
    const cap = [0, 5, 10].includes(i) ? 10 : i === 19 ? 5 : i >= 15 ? 12 : 20;
    assert.ok(l.parAnswers <= cap, `${l.id} parAnswers ${l.parAnswers} > ${cap}`);
  });
});

test('hard: the tool decides par (removing it changes par) on 41, 46, 51 and at least 15 of 20', () => {
  let decide = 0;
  const failed = [];
  L.forEach((raw, i) => {
    const { tool: _t, ...noTool } = raw;
    const s = solve(parseLevel(noTool), { maxPar: raw.par, maxNodes: NODES });
    if (s === null || s.par !== raw.par) decide++;
    else failed.push(i + 41);
  });
  for (const n of [41, 46, 51]) assert.ok(!failed.includes(n), `${n}: par unchanged without the tool`);
  assert.ok(decide >= 15, `the tool decides par on ${decide} of 20; unchanged on ${failed}`);
});

test('hard: mixes 56 to 60 have each Medium tile load-bearing, ice is seen sliding, and the gnome passes every gate level', () => {
  L.slice(15).forEach((raw) => {
    const lv = parseLevel(raw);
    const r = simulate(lv, raw.answer);
    for (const m of mechsOf(raw)) {
      const tiles = raw.tiles.map((row) => [...row].map((c) => (MECH[m].includes(c) ? '.' : c)).join(''));
      const sw = { ...raw, tiles };
      let wins = false;
      try { wins = !cutsAllRoutes(parseLevel(sw), raw.answer) && simulate(parseLevel(sw), raw.answer).result === 'win'; } catch { wins = false; }
      const changed = !wins || solve(parseLevel(sw), { maxPar: raw.par - 1, maxNodes: NODES }) !== null;
      assert.ok(changed, `${raw.id}: ${m} is not load-bearing`);
    }
    if (mechsOf(raw).includes('ice')) assert.ok((r.trails || []).some((t) => t.length >= 2), `${raw.id}: no slide in the stored answer's replay`);
    if (mechsOf(raw).includes('gate')) assert.ok(r.steps.some(([x, y]) => '><^v'.includes(lv.tile(x, y))), `${raw.id}: the route passes no gate`);
  });
});

test('hard: bridges span rivers, no duplicate boards, no look-alikes within a group', () => {
  for (const l of L) assert.deepEqual(invalidBridges(l.tiles), [], l.id);
  assert.equal(new Set(L.map((l) => l.tiles.join('/'))).size, 20);
  for (const [from, to] of [[0, 4], [5, 9], [10, 14], [15, 19]]) {
    for (let a = from; a <= to; a++) for (let b = a + 1; b <= to; b++) assert.equal(lookAlike(L[a].tiles, L[b].tiles), false, `${L[a].id} looks like ${L[b].id}`);
  }
});

test('hard: the shipped file is what the build makes (deterministic) and the build is quick', () => {
  const t0 = Date.now();
  assert.deepEqual(buildHard().pack, hard);
  assert.ok(Date.now() - t0 < 120000, 'default build under 2 minutes');
});
