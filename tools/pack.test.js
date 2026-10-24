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
    assert.equal(l.size, i < 5 ? 5 : i < 20 ? 7 : 9, l.id);
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
    assert.equal(raw.wallBudget, raw.par + 1, `${raw.id} wallBudget`);

    const open = findPath(lv, []);
    assert.ok(open, `${raw.id} has a no-walls route`);
    // Level 1 is open grass with a single-wall answer: that is only unique on a 2-move
    // straight line, so it is exempt from the "route >= grid size" rule.
    if (n > 1) assert.ok(open.positions.length - 1 >= raw.size, `${raw.id} route ${open.positions.length - 1}`);

    assert.equal(simulate(lv, []).result, 'lose', `${raw.id} robot must win with no walls`);
    assert.equal(simulate(lv, s.answer).result, 'win', `${raw.id} par answer stops the robot`);

    if (n >= 6) {
      assert.equal(isRingAnswer(lv, s.answer), false, `${raw.id} ring answer`);
      assert.equal(raw.parAnswers, 1, `${raw.id} unique`);
      if (raw.size === 7) assert.ok(raw.par >= 2 && raw.par <= 4, `${raw.id} par`);
      else assert.ok(raw.par >= 3 && raw.par <= 5, `${raw.id} par`);
    }
    if (n <= 5) assert.equal(raw.parAnswers, 1, `${raw.id} tutorial must be unique`);
  });
});

test('pack-01: tutorial teaches one idea at a time, in order', () => {
  const t = pack.levels.slice(0, 5);
  const has = (l, ch) => l.tiles.some((r) => r.includes(ch));
  const tele = (l) => l.tiles.some((r) => /[a-z]/.test(r));
  assert.equal(t[0].par, 1);
  assert.ok(!has(t[0], '#') && !has(t[0], '~') && !tele(t[0]));
  assert.ok(has(t[1], '#') && !has(t[1], '~') && !tele(t[1]));
  assert.ok(has(t[2], '~') && has(t[2], '='));
  assert.ok(tele(t[3]));
  const lv5 = parseLevel(t[4]);
  assert.equal(simulate(lv5, solve(lv5).answer).reason, 'too-far');
  // Only levels 1 and 2 may have a ring answer.
  t.forEach((raw, i) => {
    const lv = parseLevel(raw);
    if (i >= 2) assert.equal(isRingAnswer(lv, solve(lv).answer), false, raw.id);
  });
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
