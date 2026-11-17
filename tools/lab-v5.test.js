import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLevel, findPath, solve, countAnswers, simulate, cutsAllRoutes, capViolation } from '../src/game/index.js';
import { slideLinesInAnswer, placeableOrder, buildLevel, BOARDS } from './build-lab-v5.js';

const file = fileURLToPath(new URL('../assets/levels/lab-v5.json', import.meta.url));
const lab = JSON.parse(readFileSync(file, 'utf8'));

const MECH = { ice: '*', mud: '&', gate: '><^v' };
/** Which of ice, mud, gate a board uses. */
const mechsOf = (raw) => Object.keys(MECH).filter((m) => [...MECH[m]].some((c) => raw.tiles.join('').includes(c)));

test('lab-v5: shape, 7 levels lab5-01 to lab5-07, all rules v5, 5x5 or 7x7, boards differ', () => {
  assert.equal(lab.id, 'lab-v5');
  assert.equal(lab.rules, 'v5');
  assert.equal(lab.levels.length, 7);
  lab.levels.forEach((l, i) => {
    assert.equal(l.id, `lab5-0${i + 1}`);
    assert.equal(l.rules, 'v5', l.id);
    assert.ok(l.size === 5 || l.size === 7, `${l.id} size ${l.size}`);
  });
  assert.equal(new Set(lab.levels.map((l) => l.tiles.join('/'))).size, 7, 'all boards differ');
});

test('lab-v5: ice x2, mud x2, gates x2, then one mix', () => {
  const kinds = lab.levels.map((l) => mechsOf(l).join('+'));
  assert.deepEqual(kinds.slice(0, 2), ['ice', 'ice']);
  assert.deepEqual(kinds.slice(2, 4), ['mud', 'mud']);
  assert.deepEqual(kinds.slice(4, 6), ['gate', 'gate']);
  assert.ok(mechsOf(lab.levels[6]).length >= 2, `the last level mixes: ${kinds[6]}`);
});

test('lab-v5: every level is consistent with the engine (par 2 to 4, budget par + 2, answer wins, the gnome wins with no fences)', () => {
  for (const raw of lab.levels) {
    const lv = parseLevel(raw);
    assert.equal(lv.rules, 'v5', raw.id);
    const s = solve(lv);
    assert.ok(s, raw.id);
    assert.equal(raw.par, s.par, `${raw.id} par matches solve`);
    assert.ok(raw.par >= 2 && raw.par <= 4, `${raw.id} par ${raw.par}`);
    assert.equal(raw.parAnswers, countAnswers(lv, s.par, 50), `${raw.id} parAnswers (capped at 50)`);
    assert.equal(raw.wallBudget, raw.par + 2, `${raw.id} budget = par + 2`);
    assert.equal(raw.answer.length, raw.par, `${raw.id} answer length = par`);
    const won = simulate(lv, raw.answer);
    assert.equal(won.result, 'win', `${raw.id} answer wins`);
    assert.equal(won.reason, 'too-far', `${raw.id} answer wins by running out of moves`);
    assert.equal(simulate(lv, []).result, 'lose', `${raw.id}: with no fences he gets home`);
    assert.ok(raw.moveLimit >= findPath(lv, []).positions.length - 1, `${raw.id} move limit covers the free route`);
  }
});

test('lab-v5: the stored answer can be placed in its stored order, no prefix cutting every route (the UI refuses a cutting fence, hints place one at a time)', () => {
  for (const raw of lab.levels) {
    const lv = parseLevel(raw);
    for (let k = 1; k <= raw.answer.length; k++) {
      const prefix = raw.answer.slice(0, k);
      assert.equal(cutsAllRoutes(lv, prefix), false, `${raw.id} prefix of ${k} cuts every route`);
      assert.equal(capViolation(lv, prefix), null, `${raw.id} prefix of ${k} breaks the side cap`);
    }
    assert.deepEqual(placeableOrder(lv, raw.answer), raw.answer, `${raw.id} stored order is placeable as it is`);
  }
});

test('lab-v5: the mechanic is load-bearing (swap its tiles for grass and the stored answer stops winning, or par changes)', () => {
  const swapTo = { ice: '*', mud: '&', gate: '><^v' };
  for (const raw of lab.levels) {
    for (const m of mechsOf(raw)) {
      const tiles = raw.tiles.map((row) => [...row].map((c) => (swapTo[m].includes(c) ? '.' : c)).join(''));
      const swapped = { ...raw, tiles };
      let changed;
      try {
        const lv = parseLevel(swapped);
        const s = solve(lv, { maxPar: raw.par + 1 });
        const stillWins = simulate(lv, raw.answer).result === 'win';
        changed = !s || s.par !== raw.par || !stillWins;
      } catch {
        changed = true;
      }
      assert.ok(changed, `${raw.id}: ${m} is not load-bearing`);
    }
  }
});

test('lab-v5: every gate level sends him through a gate when its stored answer is played', () => {
  for (const raw of lab.levels.filter((r) => mechsOf(r).includes('gate'))) {
    const lv = parseLevel(raw);
    assert.ok(simulate(lv, raw.answer).steps.some(([x, y]) => '><^v'.includes(lv.tile(x, y))), `${raw.id} answer route uses a gate`);
  }
});

test('lab-v5: at least one ice level has a fence across a slide in its answer', () => {
  const hits = lab.levels.filter((raw) => mechsOf(raw).includes('ice') && slideLinesInAnswer(parseLevel(raw), raw.answer).length > 0);
  assert.ok(hits.length >= 1, 'a fence across a slide is part of an answer');
});

test('lab-v5: the shipped file is exactly what the build script makes (no hand edits)', () => {
  assert.equal(BOARDS.length, 7);
  BOARDS.forEach((spec, i) => {
    const { level } = buildLevel(spec);
    assert.deepEqual(level, lab.levels[i], `${spec.id} matches the shipped file`);
  });
});
