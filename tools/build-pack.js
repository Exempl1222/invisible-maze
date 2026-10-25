#!/usr/bin/env node
// Builds assets/levels/pack-01.json (shipped to the site). Offline, deterministic.
//
//   node tools/build-pack.js [--out assets/levels/pack-01.json]
//
// Levels 1-5: hand-authored 7x7 tutorial (tiles below; par and parAnswers come from the engine).
// Levels 6-20: generated 7x7, par 2-4. Levels 21-30: generated 9x9, par 3-5.
// Generated levels are unique and ring-free (generator defaults). From each candidate
// pool we keep a balanced mix of par, win reasons and teleporter use. Within each band the
// levels are ordered easiest first (par, then open-route length).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseLevel, solve, countAnswers } from '../src/game/index.js';
import { generateLevels, formatStats } from './generate.js';

// One new idea each: lines on open grass, rocks, river + bridge, teleporters, move limit.
// Every one has exactly one par answer (checked by tools/pack.test.js).
export const TUTORIAL = [
  // 1. Open grass. The robot's route is 4 moves down a two-wide strip; two lines across the strip
  //    force a detour past the limit. Route is shorter than the grid size and the answer is
  //    unavoidably a plain cut: both accepted for level 1.
  { tiles: [
      '.......',
      '.......',
      '.......',
      '...R...',
      '.......',
      '.......',
      '....B..',
  ], moveLimit: 4 },
  // 2. Rocks. They pinch the robot's start into a pocket; two lines close the last gap.
  { tiles: [
      '..#.#..',
      '....B.#',
      '.......',
      '#......',
      '.......',
      '..#.#..',
      '...#.R.',
  ], moveLimit: 8 },
  // 3. River and bridges. A bridge can't be walled, so guard the far side of the left one;
  //    the right bridge is too long a way round.
  { tiles: [
      '.......',
      '.......',
      '..R....',
      '.......',
      '~=~~~~=',
      '.......',
      '...B...',
  ], moveLimit: 10 },
  // 4. A teleporter pair is a shortcut. Wall off the approach to it, not the teleporter itself.
  { tiles: [
      '.......',
      '.R.....',
      '....a..',
      '.......',
      '.......',
      '....a.B',
      '..#...#',
  ], moveLimit: 7 },
  // 5. Move limit. The board is too open to block, so make the route too long instead.
  { tiles: [
      '.#....#',
      '.......',
      '..#.R..',
      '.#.#...',
      '.#.....',
      '.......',
      '.B.....',
  ], moveLimit: 9 },
];

const POOLS = [
  { size: 7, take: 15, quota: { 2: 5, 3: 6, 4: 4 }, minPar: 2, maxPar: 4, seed: 1, count: 300, minSlack: 0, maxSlack: 2, maxTries: 200000 },
  { size: 9, take: 10, quota: { 3: 4, 4: 4, 5: 2 }, minPar: 3, maxPar: 5, seed: 1, count: 300, minSlack: 0, maxSlack: 3, maxTries: 500000 },
];

function pick(pool, take, quota) {
  // Take each par's quota in turn (a spread of par, not all the minimum). Within a par, greedy
  // diversity: each step takes the candidate whose win reason and teleporter use are least
  // represented so far (teleporter target 60%, win reasons 50/50). If a par runs short, the
  // remaining places go to whichever pars still have candidates.
  const items = pool.levels.map((level, i) => ({ level, ...pool.meta[i] }));
  const chosen = [];
  const count = (f) => chosen.filter(f).length;
  const takeOne = (allowed) => {
    let best = -1, bestScore = Infinity;
    items.forEach((it, i) => {
      if (!allowed(it)) return;
      const score =
        count((c) => c.winReason === it.winReason) +
        (it.usesTeleporter ? count((c) => c.usesTeleporter) / 0.6 : count((c) => !c.usesTeleporter) / 0.4);
      if (score < bestScore) { bestScore = score; best = i; }
    });
    if (best === -1) return false;
    chosen.push(items.splice(best, 1)[0]);
    return true;
  };
  // interleave the pars so win reasons and teleporter use balance across the whole band
  const left = { ...quota };
  while (chosen.length < take && Object.values(left).some((n) => n > 0)) {
    let progressed = false;
    for (const par of Object.keys(left)) {
      if (left[par] > 0 && chosen.length < take) {
        left[par]--;
        if (takeOne((it) => it.level.par === Number(par))) progressed = true;
      }
    }
    if (!progressed) break;
  }
  while (chosen.length < take && takeOne(() => true));
  return chosen.sort((a, b) => a.level.par - b.level.par || a.routeLength - b.routeLength);
}

export function buildPack(log = () => {}) {
  const entries = [];
  for (const t of TUTORIAL) {
    const lv = parseLevel({ size: 7, tiles: t.tiles, moveLimit: t.moveLimit, wallBudget: 200 });
    const s = solve(lv);
    entries.push({
      size: 7,
      tiles: t.tiles,
      moveLimit: t.moveLimit,
      wallBudget: s.par + 1,
      par: s.par,
      parAnswers: countAnswers(lv, s.par),
    });
  }
  for (const p of POOLS) {
    const pool = generateLevels(p);
    log(`${p.size}x${p.size}\n${formatStats(pool.stats)}`);
    if (pool.levels.length < p.take) throw new Error(`only ${pool.levels.length} ${p.size}x${p.size} levels, need ${p.take}`);
    const pars = {};
    for (const l of pool.levels) pars[l.par] = (pars[l.par] ?? 0) + 1;
    log(`par mix in pool: ${JSON.stringify(pars)}`);
    for (const it of pick(pool, p.take, p.quota)) {
      const { id, ...rest } = it.level;
      entries.push(rest);
    }
  }
  const levels = entries.map((e, i) => ({ id: `p01-${String(i + 1).padStart(2, '0')}`, ...e }));
  return { id: 'pack-01', levels };
}

function main() {
  const args = process.argv.slice(2);
  const here = dirname(fileURLToPath(import.meta.url));
  let out = resolve(here, '../assets/levels/pack-01.json');
  if (args[0] === '--out') out = resolve(args[1]);
  const pack = buildPack((m) => console.log(m));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(pack, null, 2) + '\n');
  console.log(`wrote ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
