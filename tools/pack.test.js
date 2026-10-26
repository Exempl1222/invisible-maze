import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLevel, findPath, solve, countAnswers, simulate, cutsAllRoutes, buildableLines } from '../src/game/index.js';
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
    assert.equal(cutsAllRoutes(lv, s.answer), false, `${raw.id} par answer leaves the robot a route`);
    const won = simulate(lv, s.answer);
    assert.equal(won.result, 'win', `${raw.id} par answer stops the robot`);
    assert.equal(won.reason, 'too-far', `${raw.id} every win is out of moves`);

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
  // wall endpoints (the two tiles beside each line of an answer)
  const ends = (s) => s.answer.flatMap(([x, y, d]) => [[x, y], d === 'R' ? [x + 1, y] : [x, y + 1]]);
  const near = (lv, ch, dist, s) => {
    const spots = [];
    lv.tiles.forEach((row, y) => [...row].forEach((c, x) => { if (ch(c)) spots.push([x, y]); }));
    return ends(s).some(([x, y]) => spots.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) <= dist));
  };

  // 1: lines lengthen a route. Open grass only, and the answer is more than one wall.
  assert.ok(!has(t[0], '#') && !has(t[0], '~') && !has(t[0], '=') && !tele(t[0]));
  assert.ok(solved[0].s.par >= 2, 'level 1 needs a fence, not a single wall');
  // 2: rocks, nothing else new. The answer uses the rocks (a wall sits next to one).
  assert.ok(has(t[1], '#') && !has(t[1], '~') && !tele(t[1]));
  assert.ok(near(solved[1].lv, (c) => c === '#', 1, solved[1].s), 'level 2 answer works with a rock');
  // 3: river and bridge, nothing else new. A bridge can't be walled, so a wall guards its approach.
  assert.ok(has(t[2], '~') && has(t[2], '=') && !has(t[2], '#') && !tele(t[2]));
  assert.ok(near(solved[2].lv, (c) => c === '=', 1, solved[2].s), 'level 3 answer guards a bridge approach');
  // 4: a teleporter pair used by the robot's open route; the answer guards its approach, not the teleporter.
  assert.ok(tele(t[3]));
  assert.ok(findPath(solved[3].lv, []).teleports.length > 0, 'level 4 route uses the teleporter');
  assert.ok(near(solved[3].lv, (c) => c >= 'a' && c <= 'z', 2, solved[3].s), 'level 4 answer guards a teleporter approach');
  // 5: several routes. At least two different routes fit in the move limit with no walls (walling a
  //    line of the shortest one still leaves a route that fits), so the answer has to close all of
  //    them but one, and the one left is longer than the limit.
  const lv5 = solved[4].lv;
  const free5 = findPath(lv5, []);
  const lines5 = new Set(free5.lines);
  const alt = buildableLines(lv5).filter((w) => lines5.has((w[1] * lv5.size + w[0]) * 2 + (w[2] === 'D' ? 1 : 0)))
    .some((w) => { const r = findPath(lv5, [w]); return r && r.positions.length - 1 <= lv5.moveLimit; });
  assert.ok(alt, 'level 5 has a second route within the move limit');
  assert.ok(solved[4].s.par >= 2, 'level 5 needs a wall on each of several routes');
  assert.equal(cutsAllRoutes(lv5, solved[4].s.answer), false, 'level 5 leaves one route open');

  // every tutorial level wins on the engine's answer (out of moves), with one answer only, and none is a ring
  solved.forEach(({ raw, lv, s }) => {
    assert.equal(raw.parAnswers, 1, raw.id);
    const r = simulate(lv, s.answer);
    assert.equal(r.result, 'win', raw.id);
    assert.equal(r.reason, 'too-far', raw.id);
    assert.equal(isRingAnswer(lv, s.answer), false, raw.id);
  });
  // The bridge can't be walled: no wall in the level 3 answer touches a bridge tile.
  const bridge3 = [];
  t[2].tiles.forEach((row, y) => [...row].forEach((c, x) => { if (c === '=') bridge3.push([x, y]); }));
  for (const [x, y, d] of solved[2].s.answer) {
    const touched = [[x, y], d === 'R' ? [x + 1, y] : [x, y + 1]];
    for (const [tx, ty] of touched) assert.ok(!bridge3.some(([bx, by]) => bx === tx && by === ty));
  }
});

test('pack-01: generated levels use teleporters and every par answer is out of moves', () => {
  const gen = pack.levels.slice(5);
  let teleporter = 0;
  for (const raw of gen) {
    const lv = parseLevel(raw);
    if (findPath(lv, []).teleports.length > 0) teleporter++;
    const r = simulate(lv, solve(lv).answer);
    assert.equal(r.reason, 'too-far', raw.id);
  }
  assert.ok(teleporter >= gen.length / 2, `teleporter on route: ${teleporter}/${gen.length}`);
});
