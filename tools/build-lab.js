#!/usr/bin/env node
// Builds assets/levels/lab.json (shipped to the site). Offline, deterministic.
//
//   node tools/build-lab.js [--out assets/levels/lab.json]
//
// Five levels for the Lab tab, played under the experimental rules v4 (see docs/GAME_SPEC.md):
// two 7x7 (par 3 and 4), then three 9x9 (par 5, 6, 7 targeted; if no 7 turns up inside the work
// budget the slot falls back to the highest par found). Each level stores "rules": "v4",
// wallBudget = par + 2, the exact par, parAnswers (counted up to 50) and one par answer ("answer",
// used by hints). Uniqueness is NOT required. Move limits have bigger slack than the pack's (about
// 7 over the free route on 9x9), which is what lifts par under v4.
//
// Every slot generates a small candidate pool on its own seed and keeps the best candidate: first
// one whose answer uses a newly allowed line (next to a bridge, a teleporter, the start or the
// beacon), then fewest par answers (more of a puzzle), then the longer free route. The solver gets a
// deterministic work budget (search states, not seconds), so the output is a pure function of this file.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateLevels } from './generate.js';

export const SLOTS = [
  { size: 7, pars: [3], slack: [3, 6], count: 10, tries: 4000, maxNodes: 200000 },
  { size: 7, pars: [4], slack: [4, 7], count: 10, tries: 4000, maxNodes: 200000 },
  { size: 9, pars: [5], slack: [6, 9], count: 6, tries: 3000, maxNodes: 300000 },
  { size: 9, pars: [6], slack: [8, 11], count: 6, tries: 3000, maxNodes: 600000 },
  { size: 9, pars: [7, 6], slack: [10, 14], count: 2, tries: 3000, maxNodes: 1500000 }, // par 7 wanted; 6 only if 7 is not found
];

/** Best candidate: uses a new line, then fewest par answers, then longest free route. */
function best(levels, meta) {
  return levels
    .map((level, i) => ({ level, ...meta[i] }))
    .sort((a, b) => (b.usesNewLine - a.usesNewLine) || (a.level.parAnswers - b.level.parAnswers) || (b.routeLength - a.routeLength))[0];
}

export function buildLab(log = () => {}) {
  const levels = [];
  const info = [];
  const boards = new Set();
  SLOTS.forEach((slot, k) => {
    let picked = null;
    for (const par of slot.pars) {
      const t0 = performance.now();
      const gen = generateLevels({
        size: slot.size, count: slot.count, seed: `lab-${k + 1}-par${par}`, minPar: par, maxPar: par,
        minSlack: slot.slack[0], maxSlack: slot.slack[1], maxTries: slot.tries, maxNodes: slot.maxNodes,
        rules: 'v4', unique: false, budgetExtra: 2, answerCap: 50,
      });
      const fresh = gen.levels.map((l, i) => ({ l, m: gen.meta[i] })).filter(({ l }) => !boards.has(l.tiles.join('/')));
      log(`slot ${k + 1}: ${slot.size}x${slot.size} par ${par}: ${gen.levels.length} candidates from ${gen.tried} tries in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
      if (fresh.length) { picked = best(fresh.map((f) => f.l), fresh.map((f) => f.m)); break; }
    }
    if (!picked) throw new Error(`lab slot ${k + 1} (pars ${slot.pars}) found nothing`);
    const { id, ...rest } = picked.level; // drop the generator's temporary id
    boards.add(rest.tiles.join('/'));
    levels.push({ id: `lab-${String(k + 1).padStart(2, '0')}`, ...rest });
    info.push({ routeLength: picked.routeLength, usesNewLine: picked.usesNewLine });
  });
  return { pack: { id: 'lab', rules: 'v4', levels }, info };
}

function main() {
  const args = process.argv.slice(2);
  const here = dirname(fileURLToPath(import.meta.url));
  let out = resolve(here, '../assets/levels/lab.json');
  if (args[0] === '--out') out = resolve(args[1]);
  const t0 = performance.now();
  const { pack, info } = buildLab((m) => console.log(m));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(pack, null, 1) + '\n');
  pack.levels.forEach((l, i) => console.log(`${l.id} ${l.size}x${l.size} par ${l.par} parAnswers ${l.parAnswers} moveLimit ${l.moveLimit} free route ${info[i].routeLength} newLine ${info[i].usesNewLine}`));
  console.log(`built in ${((performance.now() - t0) / 1000).toFixed(1)}s, wrote ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
