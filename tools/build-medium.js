#!/usr/bin/env node
// Builds assets/levels/medium.json: the 20 Medium 7x7 levels, Play levels 21 to 40 (docs/GAME_SPEC.md "Rules v5", Tiers; docs/PLAY_PLAN.md).
//
//   node tools/build-medium.js                  default: rebuild the pack from the frozen boards below (a few seconds, no search)
//   node tools/build-medium.js --search [g ...] documented, seeded generator: finds boards for the groups g (a, b, c, d; default all) or single levels (21 to 40)
//                                               and prints them as JSON lines to paste into BOARDS. Slow (minutes); never run by the tests.
//
// Rules v5, budget = par + 2. The default build takes each frozen board (tiles + move limit), lets the engine compute par,
// parAnswers and the stored answer, and throws unless the Medium design metrics hold (tools/medium.test.js repeats them on the shipped file):
//   21-25 ice only (par 3, 3, 3, 3, 4)        26-30 mud only (par 3, 3, 4, 4, 4)
//   31-34 gates only (par 4, 4, 4, 4)         35-40 mixes of at least two mechanics (par 4, 4, 4, 5, 5, 5)
//   21, 26 and 31 are the intro levels: no river, bridges or teleporters, and parAnswers <= 10.
// Metrics (all throw): slack 3 to 7; density ice 3 to 8, mud 2 to 5, gates 1 to 3; every mechanic on a board is load-bearing (swap its
// tiles for grass: par changes or the stored answer stops winning); the stored answer can be placed in its stored order with no prefix
// cutting every route and within the side cap; gates valid; no duplicate boards; no look-alike boards within a group; at least 2 ice
// levels with a fence across a slide in the answer; on EVERY level with a gate the stored answer's route (simulate().steps) passes through a gate tile.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseLevel, findPath, solve, countAnswers, simulate, capViolation, createRng } from '../src/game/index.js';
import { placeableOrder, slideLinesInAnswer } from './build-lab-v5.js';

const SIZE = 7;
export const NODES = 400000; // work budget (search states) for every solve and count the build does
const MECH_TILES = { ice: '*', mud: '&', gate: '><^v' };
export const mechsOf = (tiles) => Object.keys(MECH_TILES).filter((m) => [...MECH_TILES[m]].some((c) => tiles.join('').includes(c)));
export const countTiles = (tiles, chars) => [...tiles.join('')].filter((c) => chars.includes(c)).length;

// One slot per level, in Play order. mech: what must be on the board (exactly these); par: wanted par.
// intro: the mechanic alone decides par (parAnswers <= 10). slide: the answer fences across a slide.
export const SLOTS = [
  { group: 'a', mech: ['ice'], par: 3, intro: true }, { group: 'a', mech: ['ice'], par: 3, slide: true }, { group: 'a', mech: ['ice'], par: 3, slide: true },
  { group: 'a', mech: ['ice'], par: 3 }, { group: 'a', mech: ['ice'], par: 4 },
  { group: 'b', mech: ['mud'], par: 3, intro: true }, { group: 'b', mech: ['mud'], par: 3 }, { group: 'b', mech: ['mud'], par: 4 },
  { group: 'b', mech: ['mud'], par: 4 }, { group: 'b', mech: ['mud'], par: 4 },
  { group: 'c', mech: ['gate'], par: 4, intro: true }, { group: 'c', mech: ['gate'], par: 4 }, { group: 'c', mech: ['gate'], par: 4 },
  { group: 'c', mech: ['gate'], par: 4 },
  { group: 'd', mech: ['ice', 'mud'], par: 4 }, { group: 'd', mech: ['ice', 'gate'], par: 4 }, { group: 'd', mech: ['mud', 'gate'], par: 4 },
  { group: 'd', mech: ['ice', 'mud'], par: 5 }, { group: 'd', mech: ['ice', 'gate'], par: 5 }, { group: 'd', mech: ['ice', 'mud', 'gate'], par: 5 },
];

const GROUP_FROM = { a: 0, b: 5, c: 10, d: 14 };
const groupOf = (i) => SLOTS[i].group;

/** Two boards of one group that would feel like the same level: under 18 of 49 tiles differ in any of the 8 turns and flips (gate arrows count as one kind). */
export function lookAlike(a, b) {
  const grid = (t) => t.map((r) => [...r].map((c) => ('><^v'.includes(c) ? 'g' : c)));
  const turn = (g) => g[0].map((_, x) => g.map((row) => row[x]).reverse());
  const flip = (g) => g.map((r) => r.slice().reverse());
  let g = grid(a);
  const ref = grid(b).flat();
  for (let i = 0; i < 4; i++, g = turn(g)) {
    for (const v of [g, flip(g)]) if (v.flat().filter((c, k) => c !== ref[k]).length < 18) return true;
  }
  return false;
}

/** Does `answer` still win if `tiles` are swapped for these? */
function winsOn(raw, tiles, answer) {
  try {
    return simulate(parseLevel({ ...raw, tiles }), answer).result === 'win';
  } catch {
    return false; // illegal (a cut board, a wall over a now-missing line ...): the answer no longer works
  }
}

/**
 * Is `mech` load-bearing on this level: swap its tiles for grass and the stored answer stops winning, or par changes?
 * Sound when true. False means "not shown within the work budget" (the build then rejects the level).
 */
export function loadBearing(raw, mech, par, answer, maxNodes = NODES) {
  const tiles = raw.tiles.map((r) => [...r].map((c) => (MECH_TILES[mech].includes(c) ? '.' : c)).join(''));
  if (!winsOn(raw, tiles, answer)) return true;
  // the answer still wins on grass, so par can only fall: look for a win in fewer walls
  return par > 0 && solve(parseLevel({ ...raw, tiles }), { maxPar: par - 1, maxNodes }) !== null;
}

export function slackOf(level) {
  return level.moveLimit - (findPath(parseLevel(level), []).positions.length - 1);
}

/** Tiles the gnome stands on (simulate().steps) when the stored answer is played. */
export function visited(level) {
  const lv = parseLevel(level);
  return simulate(lv, level.answer).steps.map(([x, y]) => lv.tile(x, y));
}

/** Turn one frozen board into a finished level, or throw why it is not one. */
export function buildLevel(slot, board, id) {
  const raw0 = { id, size: SIZE, tiles: board.tiles, rules: 'v5', moveLimit: board.moveLimit, wallBudget: 99 };
  const probe = parseLevel(raw0);
  const s = solve(probe, { maxPar: slot.par, maxNodes: NODES });
  if (!s || s.par !== slot.par) throw new Error(`${id}: par is not ${slot.par}`);
  const par = s.par;
  const raw = { ...raw0, wallBudget: par + 2 };
  const level = parseLevel(raw);
  const answer = placeableOrder(level, s.answer);
  if (!answer) throw new Error(`${id}: the par answer cannot be placed without a prefix cutting every route`);
  const parAnswers = countAnswers(level, par, 50, { maxNodes: NODES });
  if (parAnswers === null) throw new Error(`${id}: parAnswers ran out of work`);
  const lb = {};
  for (const m of slot.mech) lb[m] = loadBearing(raw, m, par, answer);
  return { level: { ...raw, par, parAnswers, answer }, info: { loadBearing: lb } };
}

/** Throws unless the levels meet the Medium design metrics. `infos` (from buildLevel) carries the load-bearing verdicts. */
export function checkMedium(levels, infos) {
  const seen = new Set();
  let present = 0, bearing = 0, slideLevels = 0, passLevels = 0;
  levels.forEach((l, i) => {
    const n = i + 21;
    const slot = SLOTS[i];
    if (l.id !== `medium-${String(i + 1).padStart(2, '0')}`) throw new Error(`medium ${n}: id`);
    if (l.rules !== 'v5' || l.size !== SIZE) throw new Error(`medium ${n}: rules or size`);
    if (l.wallBudget !== l.par + 2) throw new Error(`medium ${n}: budget`);
    if (l.par !== slot.par) throw new Error(`medium ${n}: par ${l.par}, wanted ${slot.par}`);
    if (JSON.stringify(mechsOf(l.tiles)) !== JSON.stringify(Object.keys(MECH_TILES).filter((m) => slot.mech.includes(m)))) throw new Error(`medium ${n}: mechanics ${mechsOf(l.tiles)}`);
    if (seen.has(l.tiles.join('/'))) throw new Error(`medium ${n}: duplicate board`);
    seen.add(l.tiles.join('/'));
    for (let m = GROUP_FROM[slot.group]; m < i; m++) if (groupOf(m) === slot.group && lookAlike(levels[m].tiles, l.tiles)) throw new Error(`medium ${n}: looks like medium ${m + 21}`);
    const slack = slackOf(l);
    if (slack < 3 || slack > 7) throw new Error(`medium ${n}: slack ${slack}`);
    const d = { ice: [3, 8], mud: [2, 5], gate: [1, 3] };
    for (const m of slot.mech) {
      const c = countTiles(l.tiles, MECH_TILES[m]);
      if (c < d[m][0] || c > d[m][1]) throw new Error(`medium ${n}: ${c} ${m} tiles`);
      present++;
      if (infos[i].loadBearing[m]) bearing++;
      else if (i < 14 || slot.intro) throw new Error(`medium ${n}: ${m} is not load-bearing`);
    }
    if (slot.intro && l.parAnswers > 10) throw new Error(`medium ${n}: ${l.parAnswers} par answers on an intro level`);
    if (/[~=a-z]/.test(l.tiles.join('').replace(/[v]/g, '')) && slot.intro) throw new Error(`medium ${n}: intro level has river, bridges or teleporters`);
    const lv = parseLevel(l);
    if (l.answer.length !== l.par || simulate(lv, l.answer).result !== 'win') throw new Error(`medium ${n}: stored answer`);
    if (capViolation(lv, l.answer)) throw new Error(`medium ${n}: side cap`);
    if (slot.slide && !slideLinesInAnswer(lv, l.answer).length) throw new Error(`medium ${n}: answer has no fence across a slide`);
    if (slideLinesInAnswer(lv, l.answer).length && slot.mech.includes('ice')) slideLevels++;
    if (visited(l).some((c) => '><^v'.includes(c))) passLevels++;
    else if (slot.mech.includes('gate')) throw new Error(`medium ${n}: the gnome does not pass a gate when the answer is played`);
  });
  if (levels.length !== 20) throw new Error('medium: need 20 levels');
  if (slideLevels < 2) throw new Error('medium: fewer than 2 ice levels with a fence across a slide');
  if (bearing / present < 0.7) throw new Error(`medium: load-bearing rate ${bearing}/${present}`);
  return { present, bearing, slideLevels, passLevels };
}

export function buildMedium(log = () => {}) {
  const built = BOARDS.map((b, i) => buildLevel(SLOTS[i], b, `medium-${String(i + 1).padStart(2, '0')}`));
  const levels = built.map((b) => b.level);
  const stats = checkMedium(levels, built.map((b) => b.info));
  built.forEach(({ level: l, info }, i) => log(`${l.id} ${SLOTS[i].mech.join('+')} par ${l.par} parAnswers ${l.parAnswers} moveLimit ${l.moveLimit} slack ${slackOf(l)} ice ${countTiles(l.tiles, '*')} mud ${countTiles(l.tiles, '&')} gates ${countTiles(l.tiles, '><^v')} loadBearing ${JSON.stringify(info.loadBearing)}`));
  log(`load-bearing ${stats.bearing}/${stats.present}, ice levels with a slide fence ${stats.slideLevels}, levels where he passes a gate ${stats.passLevels}`);
  return { pack: { id: 'medium', levels }, stats };
}

// ---------------------------------------------------------------------------------------------------------------------------
// The generator (--search). Seeded: the candidate with index i of a slot is createRng(`medium-<slot>:<i>`), so a run is repeatable.

/** A random 7x7 board with the mechanics in `mech` and nothing else (no river, bridges or teleporters). */
function terrain(rng, mech) {
  const g = Array.from({ length: SIZE }, () => Array(SIZE).fill('.'));
  const free = () => g.flatMap((row, y) => row.map((c, x) => (c === '.' ? [x, y] : null)).filter(Boolean));
  // rock walls with gaps make corridors, where fences, mud and gates matter
  const walls = rng.int(0, 2);
  for (let w = 0; w < walls; w++) {
    const vert = rng.chance(0.5), at = rng.int(2, 4);
    const gap = rng.shuffle([0, 1, 2, 3, 4, 5, 6]).slice(0, rng.int(1, 2));
    for (let k = 0; k < SIZE; k++) if (!gap.includes(k)) { if (vert) g[k][at] = '#'; else g[at][k] = '#'; }
  }
  for (let r = rng.int(2, 7); r > 0; r--) { const [x, y] = rng.pick(free()); g[y][x] = '#'; }
  const cells = free();
  if (cells.length < 20) return null;
  const [a, b] = rng.shuffle(cells);
  if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 6) return null;
  g[a[1]][a[0]] = 'R';
  g[b[1]][b[0]] = 'B';
  if (mech.includes('ice')) { // one or two lanes of ice along a row or column
    let want = rng.int(3, 8);
    for (let lane = 0; lane < 2 && want >= 3; lane++) {
      const len = Math.min(SIZE, lane === 1 ? want : Math.min(want, rng.int(3, 5)));
      const vert = rng.chance(0.5), at = rng.int(0, SIZE - 1), from = rng.int(0, SIZE - len);
      const run = Array.from({ length: len }, (_, k) => (vert ? [at, from + k] : [from + k, at]));
      if (!run.every(([x, y]) => g[y][x] === '.')) continue;
      run.forEach(([x, y]) => { g[y][x] = '*'; });
      want -= len;
      if (rng.chance(0.4)) break;
    }
  }
  if (mech.includes('mud')) {
    const near = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] === '#');
    for (let m = rng.int(2, 5); m > 0; m--) {
      const f = free();
      const pick = rng.chance(0.6) ? f.filter(([x, y]) => near(x, y)) : f;
      const [x, y] = rng.pick(pick.length ? pick : f);
      g[y][x] = '&';
    }
  }
  if (mech.includes('gate')) {
    // most gates sit on the gnome's free route, pointing his way (he can pass) or against it (he must detour); the rest anywhere
    let route = null;
    try {
      const rows = g.map((r) => r.join(''));
      route = findPath(parseLevel({ size: SIZE, tiles: rows, rules: 'v5', moveLimit: 1, wallBudget: 0 }), []);
    } catch { /* no route */ }
    const ARROW = { '0,-1': '^', '1,0': '>', '0,1': 'v', '-1,0': '<' };
    for (let k = rng.int(1, 3); k > 0; k--) {
      const on = route && rng.chance(0.7) ? route.positions.slice(1, -1).filter(([x, y]) => g[y][x] === '.') : [];
      if (on.length) {
        const [x, y] = rng.pick(on);
        const i = route.positions.findIndex(([px, py]) => px === x && py === y);
        const [px, py] = route.positions[i - 1], [nx, ny] = route.positions[i + 1];
        const dir = [nx - x, ny - y];
        if (Math.abs(dir[0]) + Math.abs(dir[1]) === 1 && px - x === -dir[0] && py - y === -dir[1]) { g[y][x] = ARROW[(rng.chance(0.75) ? dir : dir.map((d) => -d)).join(',')]; continue; }
      }
      const [x, y] = rng.pick(free());
      g[y][x] = rng.pick(['>', '<', '^', 'v']);
    }
  }
  return g.map((r) => r.join(''));
}

/** One candidate for a slot, or null. Cheap checks first; the solver last, always with a work budget. */
function candidate(slot, rng, tag) {
  const F = (k) => { if (FUNNEL) FUNNEL[k] = (FUNNEL[k] || 0) + 1; };
  F('tried');
  const tiles = terrain(rng, slot.mech);
  if (!tiles) return null;
  const d = { ice: [3, 8], mud: [2, 5], gate: [1, 3] };
  for (const m of slot.mech) { const c = countTiles(tiles, MECH_TILES[m]); if (c < d[m][0] || c > d[m][1]) return null; }
  let probe;
  try { probe = parseLevel({ size: SIZE, tiles, rules: 'v5', moveLimit: 1, wallBudget: 0 }); } catch { return null; }
  const free = findPath(probe, []);
  if (!free) return null;
  F('route');
  const route = free.positions.length - 1;
  if (route < 4) return null;
  const moveLimit = route + rng.int(3, 7);
  const raw = { id: tag, size: SIZE, tiles, rules: 'v5', moveLimit, wallBudget: slot.par + 2 };
  const lv = parseLevel(raw);
  const s = solve(lv, { maxPar: slot.par, maxNodes: SEARCH_NODES });
  if (!s || s.par !== slot.par) return null;
  F('par');
  const answer = placeableOrder(lv, s.answer);
  if (!answer) return null;
  F('placeable');
  if (slot.slide && !slideLinesInAnswer(lv, answer).length) return null;
  if (slot.mech.includes('gate') && !visited({ ...raw, par: s.par, answer }).some((c) => '><^v'.includes(c))) return null;
  F('slidepass');
  const parAnswers = countAnswers(lv, s.par, 50, { maxNodes: SEARCH_NODES });
  if (parAnswers === null || (slot.intro && parAnswers > 10)) return null;
  const lb = {};
  for (const m of slot.mech) { lb[m] = loadBearing(raw, m, s.par, answer, SEARCH_NODES); if (!lb[m]) return null; }
  return { tiles, moveLimit, par: s.par, parAnswers, route };
}
const SEARCH_NODES = 30000;
const SEED_TAG = process.env.MEDIUM_SEED_TAG || ''; // --search only: a different tag walks different candidates (to use several cores on one slot)
let FUNNEL = null; // search diagnostics: how many candidates survive each stage (set by --search)

function search(groups, log) {
  const found = [];
  for (const g of groups) {
    const t0 = Date.now();
    const used = [];
    SLOTS.forEach((slot, si) => {
      if (!(slot.group === g || String(si + 21) === g)) return;
      // boards already frozen for this group (a single-slot search must not look like its neighbours)
      for (const [bi, b] of BOARDS.entries()) if (b && bi !== si && SLOTS[bi].group === slot.group && !used.includes(b.tiles)) used.push(b.tiles);
      let tried = 0, hit = null;
      FUNNEL = {};
      for (let i = 0; !hit && i < 400000; i++) {
        tried++;
        const c = candidate(slot, createRng(`medium-${si + 21}${SEED_TAG}:${i}`), `m${si}`);
        if (!c || used.some((u) => lookAlike(u, c.tiles))) continue;
        hit = c;
      }
      if (!hit) { log(`# slot ${si + 21} (${slot.mech}) par ${slot.par}: nothing in ${tried} candidates`); return; }
      log(`# funnel ${JSON.stringify(FUNNEL)}`);
      used.push(hit.tiles);
      found.push({ slot: si, ...hit });
      log(JSON.stringify({ slot: si + 21, moveLimit: hit.moveLimit, tiles: hit.tiles }) + ` // par ${hit.par} parAnswers ${hit.parAnswers} candidates ${tried}`);
    });
    log(`# group ${g}: ${Date.now() - t0} ms`);
  }
  return found;
}

// BOARDS-BEGIN (frozen search results; edit only by pasting --search output. 39 and 40 came from MEDIUM_SEED_TAG=x or y --search 39 / 40, the rest from the default seeds; the comment gives par, parAnswers and candidates tried)
export const BOARDS = [
  { moveLimit: 9, tiles: ['.....#.', '.......', '...*...', '###*###', '...*..B', '.R.*...', '..#*...'] }, // 21: par 3 parAnswers 1 candidates 98
  { moveLimit: 9, tiles: ['#......', '...#...', '####.##', 'R.*....', '#.*..#.', '..*.B..', '.#.#...'] }, // 22: par 3 parAnswers 4 candidates 40
  { moveLimit: 8, tiles: ['#..#.R.', '......*', '#.####*', '...#.#*', '..##..*', '...#.#*', '...#B.*'] }, // 23: par 3 parAnswers 2 candidates 5
  { moveLimit: 9, tiles: ['..R##..', '*****..', '......B', '....#..', '......#', '.......', '##.....'] }, // 24: par 3 parAnswers 24 candidates 11
  { moveLimit: 11, tiles: ['..****#', '.......', '.#*....', '.B*....', '..*....', '...#...', '....R..'] }, // 25: par 4 parAnswers 18 candidates 455
  { moveLimit: 15, tiles: ['......#', '......&', '&..B#..', '.&..#..', '..&##.&', '....#..', '#...#.R'] }, // 26: par 3 parAnswers 3 candidates 39
  { moveLimit: 13, tiles: ['....#B.', '&...&..', '##....&', '.&.#...', '.......', '.R..#..', '..#&...'] }, // 27: par 3 parAnswers 8 candidates 1
  { moveLimit: 14, tiles: ['....R..', '..&....', '####&#.', '.&.....', '.#...#.', '...B...', '&#.....'] }, // 28: par 4 parAnswers 2 candidates 82
  { moveLimit: 16, tiles: ['#..##&.', '#...#..', '.......', '..#.#.R', '..&.#..', '.#.....', '.B&&#.#'] }, // 29: par 4 parAnswers 20 candidates 51
  { moveLimit: 12, tiles: ['.......', '.&.....', '.#....&', '#.#####', '....#&B', '...&...', '.&R....'] }, // 30: par 4 parAnswers 21 candidates 942
  { moveLimit: 12, tiles: ['..#....', '.......', 'R#.#...', '...#..#', '...>B..', '.....#v', '.#.....'] }, // 31: par 4 parAnswers 2 candidates 587
  { moveLimit: 13, tiles: ['......#', '..B<...', '.#.....', '#.#....', '#####.^', '...#...', '......R'] }, // 32: par 4 parAnswers 3 candidates 2991
  { moveLimit: 11, tiles: ['.R#.##.', '..#.<..', '.v..#..', '...##..', '#v.####', '....##.', '.B.....'] }, // 33: par 4 parAnswers 27 candidates 7663
  { moveLimit: 12, tiles: ['###..>B', '.###...', '..##...', '.#.#..#', '..##...', '...#..^', '..##..R'] }, // 34: par 4 parAnswers 3 candidates 5330
  { moveLimit: 10, tiles: ['B..#&..', '...#.#.', '..*#...', '..*..#&', '&.*....', '...#...', 'R..#&..'] }, // 35: par 4 parAnswers 35 candidates 206
  { moveLimit: 12, tiles: ['#...R..', '......v', '*****..', '.......', '.......', 'B.....#', '.......'] }, // 36: par 4 parAnswers 2 candidates 777
  { moveLimit: 13, tiles: ['...#&..', '.<.&&..', '#.#####', '...R..&', '.......', '...&#^.', '......B'] }, // 37: par 4 parAnswers 2 candidates 3646
  { moveLimit: 14, tiles: ['..#&&#&', '#.#..*.', '..&&.*.', '..#..*R', '.....*.', '.....*.', '.B.....'] }, // 38: par 5 parAnswers 3 candidates 853
  { moveLimit: 11, tiles: ['...<.#.', '#R..#..', '.......', '*****..', '.#..B.#', 'v......', '..#....'] }, // 39: par 5 parAnswers 50 candidates 15585
  { moveLimit: 13, tiles: ['....&.&', '..#.*..', '^...*B#', '..v^*..', '#..&.&#', '.#.&...', '...R...'] }, // 40: par 5 parAnswers 50 candidates 4288
];
// BOARDS-END

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--search') {
    search(args.length > 1 ? args.slice(1) : ['a', 'b', 'c', 'd'], (m) => console.log(m));
    return;
  }
  const t0 = Date.now();
  const { pack } = buildMedium((m) => console.log(m));
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/levels/medium.json');
  writeFileSync(out, JSON.stringify(pack, null, 2) + '\n');
  console.log(`wrote ${out} in ${Date.now() - t0} ms`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
