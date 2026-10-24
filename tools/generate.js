#!/usr/bin/env node
// Offline level generator. Not shipped to the site.
//
//   node tools/generate.js --size 9 --count 5 --seed 1 --min-par 3
//
// Builds random terrain (rocks, one meandering river with 2-4 bridges, 1-2 teleporter
// pairs, start and beacon on grass and far apart), solves each candidate exactly, keeps
// those that pass the filters (route >= grid size, no ring answer, unique on 7x7/9x9), and writes them to levels/generated/size<N>-seed<S>.json.
// Same seed, same output.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseLevel, findPath, solve, countAnswers, simulate, createRng } from '../src/game/index.js';

function buildTerrain(rng, size) {
  // Built with the river running top to bottom, then transposed/flipped at the end.
  const g = Array.from({ length: size }, () => Array(size).fill('.'));
  const rockDensity = 0.06 + rng.next() * 0.1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (rng.chance(rockDensity)) g[y][x] = '#';

  const riverCells = [];
  const putRiver = (x, y) => {
    g[y][x] = '~';
    riverCells.push([x, y]);
  };
  let rx = rng.int(Math.floor(size * 0.35), Math.ceil(size * 0.65) - 1);
  for (let y = 0; y < size; y++) {
    if (y > 0) {
      const r = rng.next();
      const nx = r < 0.25 ? rx - 1 : r < 0.5 ? rx + 1 : rx;
      const clamped = Math.max(1, Math.min(size - 2, nx));
      if (clamped !== rx) putRiver(clamped, y - 1); // keep the river 4-connected
      rx = clamped;
    }
    putRiver(rx, y);
  }

  const bridgeCount = rng.int(2, 4);
  const usedRows = new Set();
  for (const [x, y] of rng.shuffle(riverCells)) {
    if (usedRows.size >= bridgeCount) break;
    if (usedRows.has(y) || usedRows.has(y - 1) || usedRows.has(y + 1)) continue;
    usedRows.add(y);
    g[y][x] = '=';
  }

  const grass = () => {
    const out = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (g[y][x] === '.') out.push([x, y]);
    return out;
  };
  const riverX = (y) => Math.min(...riverCells.filter((c) => c[1] === y).map((c) => c[0]));
  const riverXMax = (y) => Math.max(...riverCells.filter((c) => c[1] === y).map((c) => c[0]));
  const left = grass().filter(([x, y]) => x < riverX(y));
  const right = grass().filter(([x, y]) => x > riverXMax(y));
  if (!left.length || !right.length) return null;

  let start = null, beacon = null;
  for (let tries = 0; tries < 40; tries++) {
    const a = rng.pick(left), b = rng.pick(right);
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) >= size) { start = a; beacon = b; break; }
  }
  if (!start) return null;
  g[start[1]][start[0]] = 'R';
  g[beacon[1]][beacon[0]] = 'B';

  const pairs = rng.int(1, 2);
  for (let p = 0; p < pairs; p++) {
    const free = grass();
    if (free.length < 2) return null;
    const [a, b] = rng.shuffle(free);
    const letter = 'ab'[p];
    g[a[1]][a[0]] = letter;
    g[b[1]][b[0]] = letter;
  }

  // Random orientation so rivers run both ways.
  let out = g;
  if (rng.chance(0.5)) out = out[0].map((_, x) => out.map((row) => row[x])); // transpose
  if (rng.chance(0.5)) out = out.map((row) => row.slice().reverse()); // mirror
  if (rng.chance(0.5)) out = out.slice().reverse(); // flip
  return out.map((row) => row.join(''));
}

/**
 * True if a single grid cell is orthogonally adjacent to EVERY wall in the answer
 * (a "ring" around a teleporter, the beacon, the start or any tile). Players learn
 * "box it in" from these, so the generator rejects them. Pure.
 * Any one-wall answer is trivially a ring. The level argument supplies the grid size.
 * @param {{size:number}} level
 * @param {number[][]} answer walls as [x, y]
 */
export function isRingAnswer(level, answer) {
  if (!answer.length) return false;
  for (let y = 0; y < level.size; y++) {
    for (let x = 0; x < level.size; x++) {
      if (answer.every(([wx, wy]) => Math.abs(wx - x) + Math.abs(wy - y) === 1)) return true;
    }
  }
  return false;
}

/**
 * @returns {{levels:object[], meta:object[], tried:number, solveMs:number[], stats:object}}
 * `meta[i]` describes `levels[i]`: { winReason, usesTeleporter, routeLength }.
 */
export function generateLevels({
  size = 9,
  count = 5,
  seed = 1,
  minPar = 3,
  maxPar = 6,
  unique = size >= 7,
  ringFilter = true,
  minRoute = size,
  maxTries = 50000,
} = {}) {
  const levels = [];
  const meta = [];
  const solveMs = [];
  const stats = {
    tried: 0,
    kept: 0,
    rejected: { terrain: 0, ring: 0, tooShort: 0, notUnique: 0, parOutOfRange: 0 },
    winReasons: { blocked: 0, 'too-far': 0 },
    usesTeleporter: 0,
  };
  let tried = 0;
  while (levels.length < count && tried < maxTries) {
    const rng = createRng(`${seed}:${tried}`);
    tried++;
    const tiles = buildTerrain(rng, size);
    if (!tiles) { stats.rejected.terrain++; continue; }
    const probe = parseLevel({ size, tiles, moveLimit: 1, wallBudget: 0 });
    const open = findPath(probe, []);
    if (!open) { stats.rejected.terrain++; continue; }
    const routeLength = open.positions.length - 1;
    if (routeLength < minRoute) { stats.rejected.tooShort++; continue; }
    const moveLimit = routeLength + rng.int(2, 6);
    const lv = parseLevel({ size, tiles, moveLimit, wallBudget: size * size });
    const t0 = performance.now();
    const s = solve(lv, { maxPar });
    solveMs.push(performance.now() - t0);
    if (!s || s.par < minPar) { stats.rejected.parOutOfRange++; continue; }
    if (ringFilter && isRingAnswer(lv, s.answer)) { stats.rejected.ring++; continue; }
    const answers = countAnswers(lv, s.par, unique ? 2 : 50);
    if (unique && answers !== 1) { stats.rejected.notUnique++; continue; }
    const final = parseLevel({ size, tiles, moveLimit, wallBudget: s.par + 1 });
    const winReason = simulate(final, s.answer).reason;
    const usesTeleporter = open.teleports.length > 0;
    stats.winReasons[winReason] = (stats.winReasons[winReason] ?? 0) + 1;
    if (usesTeleporter) stats.usesTeleporter++;
    levels.push({
      id: `size${size}-seed${seed}-${String(levels.length + 1).padStart(2, '0')}`,
      size,
      tiles,
      moveLimit,
      wallBudget: s.par + 1,
      par: s.par,
      parAnswers: answers,
    });
    meta.push({ winReason, usesTeleporter, routeLength });
  }
  stats.tried = tried;
  stats.kept = levels.length;
  return { levels, meta, tried, solveMs, stats };
}

export function formatStats(stats) {
  const r = stats.rejected;
  const w = stats.winReasons;
  return [
    `candidates tried: ${stats.tried}, kept: ${stats.kept}`,
    `rejected: ring ${r.ring}, too-short ${r.tooShort}, not-unique ${r.notUnique}, par out of range ${r.parOutOfRange}, bad terrain ${r.terrain}`,
    `win reasons among kept: blocked ${w.blocked}, too-far ${w['too-far']}; teleporter on open route: ${stats.usesTeleporter}`,
  ].join('\n');
}

function parseArgs(argv) {
  const opts = { size: 9, count: 5, seed: 1, minPar: 3, unique: null, ringFilter: true, minRoute: null, maxTries: 50000, maxPar: 6, out: null };
  const num = (name, v) => {
    const n = Number(v);
    if (!Number.isInteger(n)) throw new Error(`${name} needs an integer, got ${v}`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--size') opts.size = num(a, next());
    else if (a === '--count') opts.count = num(a, next());
    else if (a === '--seed') opts.seed = num(a, next());
    else if (a === '--min-par') opts.minPar = num(a, next());
    else if (a === '--max-par') opts.maxPar = num(a, next());
    else if (a === '--max-tries') opts.maxTries = num(a, next());
    else if (a === '--min-route') opts.minRoute = num(a, next());
    else if (a === '--unique') opts.unique = true;
    else if (a === '--no-unique') opts.unique = false;
    else if (a === '--no-ring-filter') opts.ringFilter = false;
    else if (a === '--out') opts.out = next();
    else throw new Error(`unknown argument ${a}`);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = performance.now();
  const gen = { ...opts };
  if (gen.unique === null) delete gen.unique; // default: on for 7x7 and 9x9
  if (gen.minRoute === null) delete gen.minRoute; // default: the grid size
  const { levels, tried, solveMs, stats } = generateLevels(gen);
  const dir = opts.out ? resolve(opts.out) : resolve(dirname(fileURLToPath(import.meta.url)), '../levels/generated');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `size${opts.size}-seed${opts.seed}.json`);
  writeFileSync(file, JSON.stringify(levels, null, 2) + '\n');
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  const maxMs = solveMs.length ? Math.max(...solveMs).toFixed(0) : 0;
  const avgMs = solveMs.length ? (solveMs.reduce((a, b) => a + b, 0) / solveMs.length).toFixed(1) : 0;
  console.log(`kept ${levels.length}/${opts.count} levels from ${tried} candidates in ${secs}s (solve avg ${avgMs}ms, max ${maxMs}ms)`);
  console.log(formatStats(stats));
  console.log(`wrote ${file}`);
  if (levels.length < opts.count) {
    console.error(`only found ${levels.length} of ${opts.count} requested within ${opts.maxTries} tries`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
