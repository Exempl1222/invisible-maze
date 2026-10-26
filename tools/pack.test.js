import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLevel, findPath, solve, countAnswers, simulate, cutsAllRoutes, capViolation, sideCounts, wouldBreakCap } from '../src/game/index.js';
import { isRingAnswer, invalidBridges } from './generate.js';

const file = fileURLToPath(new URL('../assets/levels/pack-01.json', import.meta.url));
const pack = JSON.parse(readFileSync(file, 'utf8'));

// the two tiles beside a wall line
const ends = (lv, [x, y, d]) => [[x, y], d === 'R' ? [x + 1, y] : [x, y + 1]].map(([a, b]) => lv.tile(a, b));
const isTele = (c) => c >= 'a' && c <= 'z';

test('pack-01: shape, 30 levels, ids in order, sizes by band, all rules v4', () => {
  assert.equal(pack.id, 'pack-01');
  assert.equal(pack.levels.length, 30);
  pack.levels.forEach((l, i) => {
    assert.equal(l.id, `p01-${String(i + 1).padStart(2, '0')}`);
    assert.equal(l.size, i < 5 ? 5 : i < 15 ? 7 : 9, l.id);
    assert.equal(l.rules, 'v4', `${l.id} rules`);
  });
});

test('pack-01: every level is consistent with the engine (v4)', () => {
  pack.levels.forEach((raw, i) => {
    const n = i + 1;
    const lv = parseLevel(raw);
    assert.equal(lv.rules, 'v4');
    const s = solve(lv);
    assert.ok(s, raw.id);
    assert.equal(raw.par, s.par, `${raw.id} par`);
    assert.equal(raw.parAnswers, countAnswers(lv, s.par, 50), `${raw.id} parAnswers`);
    assert.equal(raw.wallBudget, raw.par + 2, `${raw.id} wallBudget`);

    const open = findPath(lv, []);
    assert.ok(open, `${raw.id} has a no-walls route`);
    // The tutorial levels teach one idea on a small route, so they are exempt from the
    // generator's "route >= grid size" filter.
    if (n > 5) assert.ok(open.positions.length - 1 >= raw.size, `${raw.id} route ${open.positions.length - 1}`);

    assert.equal(simulate(lv, []).result, 'lose', `${raw.id} the robot wins (reaches the beacon) with no walls`);
    assert.equal(capViolation(lv, s.answer), null, `${raw.id} solver answer within the side cap`);
    assert.equal(cutsAllRoutes(lv, s.answer), false, `${raw.id} par answer leaves the robot a route`);
    const won = simulate(lv, s.answer);
    assert.equal(won.result, 'win', `${raw.id} par answer stops the robot`);
    assert.equal(won.reason, 'too-far', `${raw.id} every win is out of moves`);

    // stored answer (used by hints): legal under v4 (side cap included), par-sized, and wins
    assert.ok(Array.isArray(raw.answer), `${raw.id} has an answer`);
    assert.equal(raw.answer.length, raw.par, `${raw.id} answer length is par`);
    assert.equal(capViolation(lv, raw.answer), null, `${raw.id} stored answer within the side cap`);
    assert.equal(cutsAllRoutes(lv, raw.answer), false, `${raw.id} stored answer leaves a route`);
    const stored = simulate(lv, raw.answer); // throws if illegal
    assert.equal(stored.result, 'win', `${raw.id} stored answer wins`);
    assert.equal(stored.reason, 'too-far', `${raw.id} stored answer is out of moves`);

    if (n >= 6) assert.equal(isRingAnswer(lv, s.answer), false, `${raw.id} ring answer`);
  });
});

test('pack-01: par bands', () => {
  const band = (lo, hi) => pack.levels.slice(lo - 1, hi);
  for (const l of band(1, 5)) assert.ok(l.par >= 1 && l.par <= 3, `${l.id} tutorial par ${l.par}`);
  for (const l of band(6, 15)) assert.ok(l.par >= 3 && l.par <= 4, `${l.id} 7x7 par ${l.par}`);
  for (const l of band(16, 25)) assert.ok(l.par >= 4 && l.par <= 5, `${l.id} 9x9 par ${l.par}`);
  for (const l of band(26, 30)) assert.ok(l.par >= 6 && l.par <= 7, `${l.id} hard par ${l.par}`);
  // a spread of par, not all the minimum
  assert.equal(new Set(band(6, 15).map((l) => l.par)).size, 2, '7x7 band has both pars');
  assert.equal(new Set(band(16, 25).map((l) => l.par)).size, 2, 'first 9x9 band has both pars');
  assert.ok(band(26, 30).some((l) => l.par === 7), 'the par 7 Lab level is in the last band');
});

test('pack-01: easiest first within each band', () => {
  const routeOf = (l) => findPath(parseLevel(l), []).positions.length - 1;
  for (const [lo, hi] of [[1, 5], [6, 15], [16, 25], [26, 30]]) {
    const ls = pack.levels.slice(lo - 1, hi);
    // the tutorial is ordered by idea, not difficulty
    if (lo === 1) continue;
    for (let i = 1; i < ls.length; i++) {
      const a = ls[i - 1], b = ls[i];
      assert.ok(b.par > a.par || (b.par === a.par && routeOf(b) >= routeOf(a)), `${b.id} (par ${b.par}, route ${routeOf(b)}) after ${a.id} (par ${a.par}, route ${routeOf(a)})`);
    }
  }
});

test('pack-01: the hard band is generated (par 6 and at least one par 7), not reused from the Lab', () => {
  const last = pack.levels.slice(25);
  assert.equal(last.filter((l) => l.par === 6).length, 4);
  assert.ok(last.some((l) => l.par === 7), 'one par 7');
  const labBoards = new Set(JSON.parse(readFileSync(fileURLToPath(new URL('../assets/levels/lab.json', import.meta.url)), 'utf8')).levels.map((l) => l.tiles.join('/')));
  for (const l of pack.levels) assert.ok(!labBoards.has(l.tiles.join('/')), `${l.id} is a Lab board`);
});

test('pack-01: every bridge in every level spans a river (tutorial included)', () => {
  let bridges = 0;
  for (const l of pack.levels) {
    assert.deepEqual(invalidBridges(l.tiles), [], `${l.id}\n${l.tiles.join('\n')}`);
    bridges += l.tiles.join('').split('=').length - 1;
  }
  assert.ok(bridges > 20, `${bridges} bridges checked`);
});

test('pack-01: tutorial teaches one idea at a time, in order, and each answer uses it', () => {
  const t = pack.levels.slice(0, 5);
  const has = (l, ch) => l.tiles.some((r) => r.includes(ch));
  const tele = (l) => l.tiles.some((r) => /[a-z]/.test(r));
  const lvs = t.map((raw) => parseLevel(raw));

  // 1: walls lengthen a route. Open grass only; the answer is a fence of more than one wall away from the robot and beacon.
  assert.ok(!has(t[0], '#') && !has(t[0], '~') && !has(t[0], '=') && !tele(t[0]));
  assert.ok(t[0].par >= 2, 'level 1 needs a fence, not a single wall');
  t.forEach((raw) => assert.equal(raw.size, 5, `${raw.id} is 5x5`));
  assert.ok(t[0].answer.every((w) => ends(lvs[0], w).every((c) => c === '.')), 'level 1 answer is plain walls on grass');
  const open1 = findPath(lvs[0], []).positions.length - 1;
  assert.ok(open1 <= t[0].moveLimit, 'level 1: the robot reaches the beacon with no walls');
  assert.ok(findPath(lvs[0], t[0].answer).positions.length - 1 > t[0].moveLimit, 'level 1: the walls lengthen the route past the limit');

  // 2: rocks, nothing else new. A wall of the answer joins a rock, so the rocks do part of the blocking.
  assert.ok(has(t[1], '#') && !has(t[1], '~') && !has(t[1], '=') && !tele(t[1]));
  const rockSeal = (lv, [x, y, d]) => (d === 'R'
    ? [[x, y - 1], [x + 1, y - 1], [x, y + 1], [x + 1, y + 1]]
    : [[x - 1, y], [x - 1, y + 1], [x + 1, y], [x + 1, y + 1]]).some(([a, b]) => lv.tile(a, b) === '#');
  assert.ok(t[1].answer.some((w) => rockSeal(lvs[1], w)), 'level 2 answer meets a rock');

  // 3: river and bridge, nothing else new. The answer walls the END of a bridge (a line touching a bridge tile).
  assert.ok(has(t[2], '~') && has(t[2], '=') && !has(t[2], '#') && !tele(t[2]));
  assert.ok(t[2].answer.some((w) => ends(lvs[2], w).includes('=')), 'level 3 answer walls the end of a bridge');
  assert.ok(t[2].answer.every((w) => ends(lvs[2], w).includes('=')), 'level 3: every wall sits on a bridge end');

  // 4: a teleporter pair on the robot's open route; the answer walls right beside the teleporter.
  assert.ok(tele(t[3]) && !has(t[3], '#') && !has(t[3], '~'));
  assert.ok(findPath(lvs[3], []).teleports.length > 0, 'level 4 route uses the teleporter');
  assert.ok(t[3].answer.some((w) => ends(lvs[3], w).some(isTele)), 'level 4 answer walls beside the teleporter');
  assert.equal(findPath(lvs[3], t[3].answer).teleports.length, 0, 'level 4: the walls close the shortcut');

  // 5: walls next to the robot or beacon, at most 2 sides. The answer walls two sides of the beacon and a third wall is refused.
  const c5 = sideCounts(lvs[4], t[4].answer);
  assert.ok(c5.start + c5.beacon >= 1, 'level 5 answer has a wall beside the robot or beacon');
  assert.ok(Math.max(c5.start, c5.beacon) === 2, 'level 5 answer uses both allowed sides');
  const capped = c5.beacon === 2 ? 'beacon' : 'start';
  const [cx, cy] = capped === 'beacon' ? lvs[4].beacon : lvs[4].start;
  const third = [[cx, cy - 1, 'D'], [cx, cy, 'D'], [cx - 1, cy, 'R'], [cx, cy, 'R']]
    .filter(([x, y]) => x >= 0 && y >= 0 && x < lvs[4].size && y < lvs[4].size)
    .filter((w) => lvs[4].lineBuildable(...w) && !t[4].answer.some((a) => a.join() === w.join()));
  assert.ok(third.some((w) => wouldBreakCap(lvs[4], t[4].answer, w) === capped), 'level 5: one more side would be refused by the cap');

  // every tutorial level wins on its stored answer (out of moves) and is not a ring
  t.forEach((raw, i) => {
    const r = simulate(lvs[i], raw.answer);
    assert.equal(r.result, 'win', raw.id);
    assert.equal(r.reason, 'too-far', raw.id);
    // Level 4 is an exception (sealing the corner teleporter IS the lesson, a ring around it); a one-wall answer is trivially a ring.
    if (i !== 3 && raw.answer.length > 1) assert.equal(isRingAnswer(lvs[i], raw.answer), false, raw.id);
  });
});

test('pack-01: generated levels mix teleporter use, and a good share use a line only v4 allows', () => {
  const gen = pack.levels.slice(5);
  let teleporter = 0, v4line = 0;
  for (const raw of gen) {
    const lv = parseLevel(raw);
    if (findPath(lv, []).teleports.length > 0) teleporter++;
    if (raw.answer.some((w) => ends(lv, w).some((c) => c !== '.'))) v4line++;
  }
  assert.ok(teleporter >= gen.length * 0.4 && teleporter <= gen.length * 0.9, `teleporter on route: ${teleporter}/${gen.length}`);
  assert.ok(v4line >= gen.length / 2, `answers using a v4-only line: ${v4line}/${gen.length}`);
});
