import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLevel, findPath, solve, countAnswers, simulate } from '../src/game/index.js';
import { isRingAnswer } from './generate.js';

const file = fileURLToPath(new URL('../assets/levels/pack-01.json', import.meta.url));
const pack = JSON.parse(readFileSync(file, 'utf8'));

test('pack-01: shape, 30 levels, ids in order, sizes by band', () => {
  assert.equal(pack.id, 'pack-01');
  assert.equal(pack.levels.length, 30);
  pack.levels.forEach((l, i) => {
    assert.equal(l.id, `p01-${String(i + 1).padStart(2, '0')}`);
    assert.equal(l.size, i < 20 ? 7 : 9, l.id);
  });
});

test('pack-01: every level is consistent with the engine', () => {
  pack.levels.forEach((raw, i) => {
    const n = i + 1;
    const lv = parseLevel(raw);
    const s = solve(lv);
    assert.ok(s, raw.id);
    assert.equal(raw.par, s.par, `${raw.id} par`);
    assert.equal(raw.parAnswers, countAnswers(lv, s.par), `${raw.id} parAnswers`);
    assert.equal(raw.parAnswers, 1, `${raw.id} exactly one par answer`);
    assert.equal(raw.wallBudget, raw.par + 1, `${raw.id} wallBudget`);

    const open = findPath(lv, []);
    assert.ok(open, `${raw.id} has a no-walls route`);
    // The tutorial levels teach one idea on a small route, so they are exempt from the
    // generator's "route >= grid size" filter.
    if (n > 5) assert.ok(open.positions.length - 1 >= raw.size, `${raw.id} route ${open.positions.length - 1}`);

    assert.equal(simulate(lv, []).result, 'lose', `${raw.id} robot must win with no walls`);
    assert.equal(simulate(lv, s.answer).result, 'win', `${raw.id} par answer stops the robot`);

    if (n >= 6) {
      assert.equal(isRingAnswer(lv, s.answer), false, `${raw.id} ring answer`);
      if (raw.size === 7) assert.ok(raw.par >= 2 && raw.par <= 4, `${raw.id} par`);
      else assert.ok(raw.par >= 3 && raw.par <= 5, `${raw.id} par`);
    }
  });
});

test('pack-01: easiest first within the tutorial, the 7x7 band and the 9x9 band', () => {
  const pars = pack.levels.map((l) => l.par);
  for (const [lo, hi] of [[5, 20], [20, 30]]) {
    for (let i = lo + 1; i < hi; i++) assert.ok(pars[i] >= pars[i - 1], `p01-${i + 1} par ${pars[i]} after ${pars[i - 1]}`);
  }
  assert.ok(Math.max(...pars.slice(0, 5)) <= 3, 'tutorial par is small');
  // a spread of par, not all the minimum
  assert.ok(new Set(pars.slice(5, 20)).size >= 3, '7x7 band has 3 different pars');
  assert.ok(new Set(pars.slice(20)).size >= 2, '9x9 band has 2 different pars');
});

test('pack-01: tutorial teaches one idea at a time, in order', () => {
  const t = pack.levels.slice(0, 5);
  const has = (l, ch) => l.tiles.some((r) => r.includes(ch));
  const tele = (l) => l.tiles.some((r) => /[a-z]/.test(r));
  const solved = t.map((raw) => ({ raw, lv: parseLevel(raw), s: solve(parseLevel(raw)) }));

  // 1: open grass only
  assert.ok(!has(t[0], '#') && !has(t[0], '~') && !has(t[0], '=') && !tele(t[0]));
  // 2: rocks, nothing else new
  assert.ok(has(t[1], '#') && !has(t[1], '~') && !tele(t[1]));
  // 3: river and bridge
  assert.ok(has(t[2], '~') && has(t[2], '=') && !tele(t[2]));
  // 4: a teleporter pair, used by the robot's open route
  assert.ok(tele(t[3]));
  assert.ok(findPath(solved[3].lv, []).teleports.length > 0, 'level 4 route uses the teleporter');
  // 5: the move limit does the work: the par answer lengthens the route, and no wall set within
  //    budget can block the robot completely
  assert.equal(simulate(solved[4].lv, solved[4].s.answer).reason, 'too-far');
  const blockable = parseLevel({ ...t[4], moveLimit: 1000, wallBudget: t[4].wallBudget });
  assert.equal(solve(blockable, { maxPar: t[4].wallBudget }), null, 'level 5 cannot be blocked within budget');

  // every tutorial level wins on the engine's answer, with one answer only
  solved.forEach(({ raw, lv, s }) => {
    assert.equal(raw.parAnswers, 1, raw.id);
    assert.equal(simulate(lv, s.answer).result, 'win', raw.id);
  });
  // Only level 1 (a plain cut across the open board) may use a ring-shaped answer.
  solved.forEach(({ raw, lv, s }, i) => {
    if (i >= 1) assert.equal(isRingAnswer(lv, s.answer), false, raw.id);
  });
  // The bridge can't be walled: no wall in the level 3 answer touches the bridge row's bridge tiles.
  const bridge3 = [];
  t[2].tiles.forEach((row, y) => [...row].forEach((c, x) => { if (c === '=') bridge3.push([x, y]); }));
  for (const [x, y, d] of solved[2].s.answer) {
    const touched = [[x, y], d === 'R' ? [x + 1, y] : [x, y + 1]];
    for (const [tx, ty] of touched) assert.ok(!bridge3.some(([bx, by]) => bx === tx && by === ty));
  }
});

test('pack-01: generated levels mix win reasons and use teleporters', () => {
  const gen = pack.levels.slice(5);
  let teleporter = 0;
  const reasons = { blocked: 0, 'too-far': 0 };
  for (const raw of gen) {
    const lv = parseLevel(raw);
    if (findPath(lv, []).teleports.length > 0) teleporter++;
    reasons[simulate(lv, solve(lv).answer).reason]++;
  }
  assert.ok(teleporter >= gen.length / 2, `teleporter on route: ${teleporter}/${gen.length}`);
  assert.ok(reasons.blocked >= 5 && reasons['too-far'] >= 5, JSON.stringify(reasons));
});
