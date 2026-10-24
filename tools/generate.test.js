import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseLevel, solve, countAnswers, simulate } from '../src/game/index.js';
import { generateLevels } from './generate.js';

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
  const { levels } = generateLevels({ size: 7, count: 3, seed: 1, minPar: 2 });
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
    check(levels, { minPar: 2, unique: false });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
