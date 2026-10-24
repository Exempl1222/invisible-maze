#!/usr/bin/env node
// Builds assets/levels/pack-01.json (shipped to the site). Offline, deterministic.
//
//   node tools/build-pack.js [--out assets/levels/pack-01.json]
//
// Levels 1-5: hand-authored 5x5 tutorial (tiles below; par and parAnswers come from the engine).
// Levels 6-20: generated 7x7, par 2-4. Levels 21-30: generated 9x9, par 3-5.
// Generated levels are unique and ring-free (generator defaults). From each candidate
// pool we keep a balanced mix of win reasons and prefer teleporters on the open route.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseLevel, solve, countAnswers } from '../src/game/index.js';
import { generateLevels, formatStats } from './generate.js';

// One new idea each: grass, rocks, river + bridges, teleporters, move limit.
export const TUTORIAL = [
  // 1. Open grass. Only the middle tile stops a 2-move route. Route is shorter than the grid
  //    size and the answer is a ring (a one-wall answer always is): both are unavoidable here.
  { tiles: ['.....', '.....', '.R.B.', '.....', '.....'], moveLimit: 2 },
  // 2. Rocks. The start's only exit is one tile. A ring (single wall), accepted for level 2.
  { tiles: ['...#.', '...##', '....#', '#.#.B', 'R....'], moveLimit: 7 },
  // 3. River with two bridges. Bridges can't be walled, so wall the tile beyond each one.
  { tiles: ['.~...', '.~...', 'R=...', '.=..B', '.~...'], moveLimit: 7 },
  // 4. A teleporter pair: the robot jumps from one end to the other in a single move.
  { tiles: ['#a#..', '.....', '...R#', '.....', 'Ba...'], moveLimit: 8 },
  // 5. Move limit: the winning walls make the route too long, they don't block it.
  { tiles: ['#....', '...B.', '..#..', 'R....', '.....'], moveLimit: 7 },
];

const POOLS = [
  { size: 7, take: 15, minPar: 2, maxPar: 4, seed: 1, count: 60, minSlack: 0, maxSlack: 2, maxTries: 200000 },
  { size: 9, take: 10, minPar: 3, maxPar: 5, seed: 1, count: 20, maxTries: 500000 },
];

function pick(pool, take) {
  // Greedy diversity: each step takes the candidate whose par, win reason and teleporter
  // use are least represented so far (teleporter target 60%, win reasons 50/50).
  const items = pool.levels.map((level, i) => ({ level, ...pool.meta[i] }));
  const chosen = [];
  const count = (f) => chosen.filter(f).length;
  while (chosen.length < take && items.length) {
    let best = 0, bestScore = Infinity;
    items.forEach((it, i) => {
      const score =
        count((c) => c.level.par === it.level.par) * 1.5 +
        count((c) => c.winReason === it.winReason) +
        (it.usesTeleporter ? count((c) => c.usesTeleporter) / 0.6 : count((c) => !c.usesTeleporter) / 0.4);
      if (score < bestScore) { bestScore = score; best = i; }
    });
    chosen.push(items.splice(best, 1)[0]);
  }
  return chosen.sort((a, b) => a.level.par - b.level.par || a.routeLength - b.routeLength);
}

export function buildPack(log = () => {}) {
  const entries = [];
  for (const t of TUTORIAL) {
    const lv = parseLevel({ size: 5, tiles: t.tiles, moveLimit: t.moveLimit, wallBudget: 25 });
    const s = solve(lv);
    entries.push({
      size: 5,
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
    for (const it of pick(pool, p.take)) {
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
