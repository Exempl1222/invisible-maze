#!/usr/bin/env node
// Offline level generator. Not shipped to the site.
//
//   node tools/generate.js --size 9 --count 5 --seed 1 --min-par 3
//
// Builds random terrain (rocks, one meandering river with 2-4 bridges, 1-2 teleporter
// pairs, start and beacon on grass and far apart), solves each candidate exactly, keeps
// those that pass the filters (route >= grid size, par in range, no ring answer, exactly one
// par answer), and writes them to levels/generated/size<N>-seed<S>.json. Sizes 7 and 9 only
// (5x5 is gone in rules v3). Every win is "too-far" (rules v3.1: the robot must keep a route). Walls are lines: [x, y, "R" | "D"].
// Same seed, same output.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseLevel, findPath, solve, countAnswers, simulate, createRng } from '../src/game/index.js';

/**
 * True if the bridge tile at (x, y) links two pieces of land: walkable land (not river, rock, another
 * bridge, and on the board) on both opposite sides along one axis, and river on both sides of the
 * other axis. Pure; `tiles` is the array of row strings. A tile that is not a bridge is never valid.
 */
export function isValidBridge(tiles, x, y) {
  const at = (a, b) => (a >= 0 && b >= 0 && b < tiles.length && a < tiles[b].length ? tiles[b][a] : null);
  if (at(x, y) !== '=') return false;
  const land = (c) => c !== null && c !== '~' && c !== '#' && c !== '=';
  const river = (c) => c === '~';
  const [l, r, u, d] = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
  return (land(l) && land(r) && river(u) && river(d)) || (land(u) && land(d) && river(l) && river(r));
}

/** Every bridge of a board that fails isValidBridge, as [x, y] pairs in reading order. */
export function invalidBridges(tiles) {
  const bad = [];
  tiles.forEach((row, y) => [...row].forEach((c, x) => { if (c === '=' && !isValidBridge(tiles, x, y)) bad.push([x, y]); }));
  return bad;
}

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

  // Bridges must span the river: land on both sides along one axis and river on both sides of the other
  // (isValidBridge). Pick river cells that already satisfy that, then clear any rock on the landing tiles.
  const bridgeCount = rng.int(2, 4);
  const usedRows = new Set();
  const at = (x, y) => (x >= 0 && y >= 0 && x < size && y < size ? g[y][x] : null);
  const isLand = (c) => c !== null && c !== '~' && c !== '=';
  for (const [x, y] of rng.shuffle(riverCells)) {
    if (usedRows.size >= bridgeCount) break;
    if (usedRows.has(y) || usedRows.has(y - 1) || usedRows.has(y + 1)) continue;
    const lr = isLand(at(x - 1, y)) && isLand(at(x + 1, y)) && at(x, y - 1) === '~' && at(x, y + 1) === '~';
    if (!lr) continue; // the river runs top to bottom here, so a crossing goes left to right
    usedRows.add(y);
    g[y][x] = '=';
    g[y][x - 1] = g[y][x - 1] === '#' ? '.' : g[y][x - 1];
    g[y][x + 1] = g[y][x + 1] === '#' ? '.' : g[y][x + 1];
  }
  if (usedRows.size < 2) return null;

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
  const rows = out.map((row) => row.join(''));
  return invalidBridges(rows).length === 0 ? rows : null;
}

/**
 * True if a single tile is touched by EVERY line of the answer (a line touches the two
 * tiles beside it). That is a "ring": a cage around a teleporter, the beacon, the start or
 * any tile. Players learn "box it in" from these, so the generator rejects them. Pure.
 * Any one-line answer is trivially a ring. The level argument supplies the grid size.
 * @param {{size:number}} level
 * @param {Array<[number, number, 'R'|'D']>} answer walls as [x, y, "R" | "D"]
 */
export function isRingAnswer(level, answer) {
  if (!answer.length) return false;
  const touches = new Map();
  for (const [x, y, dir] of answer) {
    const a = y * level.size + x;
    const b = dir === 'R' ? a + 1 : a + level.size;
    touches.set(a, (touches.get(a) ?? 0) + 1);
    touches.set(b, (touches.get(b) ?? 0) + 1);
  }
  for (const n of touches.values()) if (n === answer.length) return true;
  return false;
}

/** True if an answer wall sits next to a bridge, a teleporter, the start or the beacon (lines only rules v4 allows). */
export function usesV4Line(level, answer) {
  return answer.some(([x, y, d]) => [level.tile(x, y), level.tile(d === 'R' ? x + 1 : x, d === 'D' ? y + 1 : y)].some((c) => c !== '.'));
}

/**
 * @returns {{levels:object[], meta:object[], tried:number, solveMs:number[], stats:object}}
 * `meta[i]` describes `levels[i]`: { usesTeleporter, routeLength }. (Every win is "too-far" in
 * rules v3.1, so there is no win reason to record.)
 */
export function generateLevels({
  size = 9,
  count = 5,
  seed = 1,
  minPar = 3,
  maxPar = 6,
  unique = true,
  ringFilter = true,
  minRoute = size,
  minSlack = 2,
  maxSlack = 6,
  maxTries = 50000,
  rules = 'v3.1', // 'v4' for the lab: unique is not required, budget = par + budgetExtra
  budgetExtra = 1,
  answerCap = 50,
  maxNodes = Infinity, // solve work budget per candidate (deterministic); a candidate over it counts as par out of range
} = {}) {
  if (!Number.isInteger(size) || size < 7) throw new Error(`size must be 7 or more (5x5 boards are gone in rules v3), got ${size}`);
  const levels = [];
  const meta = [];
  const solveMs = [];
  const stats = {
    tried: 0,
    kept: 0,
    rejected: { terrain: 0, duplicate: 0, tooShort: 0, unsolvable: 0, parOutOfRange: 0, ring: 0, notUnique: 0 },
    usesTeleporter: 0,
  };
  const seenBoards = new Set();
  let tried = 0;
  while (levels.length < count && tried < maxTries) {
    const rng = createRng(`${seed}:${tried}`);
    tried++;
    const tiles = buildTerrain(rng, size);
    if (!tiles) { stats.rejected.terrain++; continue; }
    const board = tiles.join('/');
    if (seenBoards.has(board)) { stats.rejected.duplicate++; continue; }
    const probe = parseLevel({ size, tiles, moveLimit: 1, wallBudget: 0, rules });
    const open = findPath(probe, []);
    if (!open) { stats.rejected.terrain++; continue; }
    const routeLength = open.positions.length - 1;
    if (routeLength < minRoute) { stats.rejected.tooShort++; continue; }
    const moveLimit = routeLength + rng.int(minSlack, maxSlack);
    const lv = parseLevel({ size, tiles, moveLimit, wallBudget: size * size * 2, rules });
    const t0 = performance.now();
    const s = solve(lv, { maxPar, maxNodes });
    solveMs.push(performance.now() - t0);
    if (!s) {
      // null means either no legal wall set wins at all, or par is above maxPar
      // (rules v4 skips the unbounded re-solve: it can take minutes on a 9x9 and only sharpens a statistic)
      stats.rejected[rules !== 'v3.1' || solve(lv) ? 'parOutOfRange' : 'unsolvable']++;
      continue;
    }
    if (s.par < minPar) { stats.rejected.parOutOfRange++; continue; }
    if (ringFilter && isRingAnswer(lv, s.answer)) { stats.rejected.ring++; continue; }
    const answers = countAnswers(lv, s.par, unique ? 2 : answerCap);
    if (unique && answers !== 1) { stats.rejected.notUnique++; continue; }
    const final = parseLevel({ size, tiles, moveLimit, wallBudget: s.par + budgetExtra, rules });
    if (simulate(final, s.answer).reason !== 'too-far') throw new Error('every win must be too-far under rules v3.1');
    const usesTeleporter = open.teleports.length > 0;
    if (usesTeleporter) stats.usesTeleporter++;
    seenBoards.add(board);
    levels.push({
      id: `size${size}-seed${seed}-${String(levels.length + 1).padStart(2, '0')}`,
      size,
      tiles,
      ...(rules === 'v3.1' ? {} : { rules }),
      moveLimit,
      wallBudget: s.par + budgetExtra,
      par: s.par,
      parAnswers: answers,
      answer: s.answer, // one par answer, for hints
    });
    meta.push({ usesTeleporter, routeLength, usesNewLine: usesV4Line(lv, s.answer) });
  }
  stats.tried = tried;
  stats.kept = levels.length;
  return { levels, meta, tried, solveMs, stats };
}

export function formatStats(stats) {
  const r = stats.rejected;
  return [
    `candidates tried: ${stats.tried}, kept: ${stats.kept}`,
    `rejected (first failing filter, in order): bad terrain ${r.terrain}, duplicate board ${r.duplicate}, route too short ${r.tooShort}, unsolvable ${r.unsolvable}, par out of range ${r.parOutOfRange}, ring ${r.ring}, not unique ${r.notUnique}`,
    `teleporter on open route among kept: ${stats.usesTeleporter}`,
  ].join('\n');
}

function parseArgs(argv) {
  const opts = { size: 9, count: 5, seed: 1, minPar: 3, unique: null, ringFilter: true, minRoute: null, minSlack: 2, maxSlack: 6, maxTries: 50000, maxPar: 6, out: null };
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
    else if (a === '--min-slack') opts.minSlack = num(a, next());
    else if (a === '--max-slack') opts.maxSlack = num(a, next());
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
  const maxMs = solveMs.length ? solveMs.reduce((a, b) => Math.max(a, b), 0).toFixed(0) : 0;
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
