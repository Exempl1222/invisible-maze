import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseLevel, solve, countAnswers, simulate } from '../src/game/index.js';
import { generateLevels, isRingAnswer } from './generate.js';

function check(levels, { minPar, unique }) {
  for (const raw of levels) {
    const lv = parseLevel(raw); // parses
    const s = solve(lv);
    assert.ok(s, raw.id);
    assert.ok(s.par >= minPar, `${raw.id} par ${s.par}`);
    assert.equal(raw.par, s.par);
    assert.ok(raw.wallBudget >= s.par, raw.id);
    assert.equal(raw.wallBudget, s.par + 1);
    assert.equal(simulate(lv, s.answer).result, 'win');
    assert.equal(raw.parAnswers, countAnswers(lv, s.par));
    if (unique) assert.equal(countAnswers(lv, s.par), 1, raw.id);
  }
}

test('generateLevels: every level parses, meets min-par, budget >= par', () => {
  const { levels } = generateLevels({ size: 7, count: 3, seed: 1, minPar: 2, unique: false });
  assert.equal(levels.length, 3);
  check(levels, { minPar: 2, unique: false });
});

test('generateLevels: --unique gives exactly one par answer', () => {
  const { levels } = generateLevels({ size: 7, count: 2, seed: 3, minPar: 2, unique: true });
  assert.equal(levels.length, 2);
  check(levels, { minPar: 2, unique: true });
});

test('generation is reproducible from the seed', () => {
  const a = generateLevels({ size: 7, count: 2, seed: 9, minPar: 2 });
  const b = generateLevels({ size: 7, count: 2, seed: 9, minPar: 2 });
  assert.deepEqual(a.levels, b.levels);
});

test('CLI writes levels/generated-style JSON', () => {
  const out = mkdtempSync(join(tmpdir(), 'gen-'));
  try {
    const script = fileURLToPath(new URL('./generate.js', import.meta.url));
    const r = spawnSync(process.execPath, [script, '--size', '7', '--count', '2', '--seed', '4', '--min-par', '2', '--out', out], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const files = readdirSync(out);
    assert.deepEqual(files, ['size7-seed4.json']);
    const levels = JSON.parse(readFileSync(join(out, files[0]), 'utf8'));
    assert.equal(levels.length, 2);
    check(levels, { minPar: 2, unique: true });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('isRingAnswer: ring around a tile, and not-a-ring', () => {
  const lv = { size: 9 };
  assert.equal(isRingAnswer(lv, [[1, 1], [0, 2], [2, 2], [1, 3]]), true); // all touch [1,2]
  assert.equal(isRingAnswer(lv, [[1, 1], [2, 2]]), true); // both touch [1,2] and [2,1]
  assert.equal(isRingAnswer(lv, [[1, 1], [3, 1]]), true); // both touch [2,1]
  assert.equal(isRingAnswer(lv, [[1, 1], [4, 4]]), false);
  assert.equal(isRingAnswer(lv, [[1, 1], [2, 2], [5, 5]]), false);
  assert.equal(isRingAnswer(lv, [[1, 1], [0, 2], [2, 2], [1, 4]]), false); // one wall off the ring
  assert.equal(isRingAnswer(lv, [[3, 3]]), true); // a single wall always touches a cell
  assert.equal(isRingAnswer(lv, []), false);
});

test('isRingAnswer: ring cell may sit on the grid edge', () => {
  assert.equal(isRingAnswer({ size: 5 }, [[0, 1], [1, 0]]), true); // around [0,0]
  assert.equal(isRingAnswer({ size: 5 }, [[0, 0], [0, 2]]), true); // around [0,1]
});

test('generateLevels: kept levels pass the ring, route-length and unique filters', () => {
  const { levels, meta, stats } = generateLevels({ size: 7, count: 3, seed: 5, minPar: 2 });
  assert.equal(levels.length, 3);
  for (const [i, raw] of levels.entries()) {
    const lv = parseLevel(raw);
    const s = solve(lv);
    assert.equal(isRingAnswer(lv, s.answer), false, raw.id);
    assert.equal(raw.parAnswers, 1, raw.id);
    assert.ok(meta[i].routeLength >= 7, raw.id);
    assert.equal(simulate(lv, s.answer).reason, meta[i].winReason);
  }
  assert.equal(stats.kept, 3);
  assert.equal(stats.winReasons.blocked + stats.winReasons['too-far'], 3);
});

test('generateLevels: stats count every candidate once', () => {
  const { stats } = generateLevels({ size: 7, count: 2, seed: 2, minPar: 2 });
  const r = stats.rejected;
  const rejected = r.terrain + r.ring + r.tooShort + r.notUnique + r.parOutOfRange;
  assert.equal(stats.tried, stats.kept + rejected);
});

test('generateLevels: the ring filter and route filter can be switched off', () => {
  const on = generateLevels({ size: 7, count: 6, seed: 1, minPar: 2, unique: false });
  const off = generateLevels({ size: 7, count: 6, seed: 1, minPar: 2, unique: false, ringFilter: false, minRoute: 1 });
  assert.ok(on.stats.rejected.ring + on.stats.rejected.tooShort > 0);
  assert.equal(off.stats.rejected.ring + off.stats.rejected.tooShort, 0);
});
