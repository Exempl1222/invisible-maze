#!/usr/bin/env node
// Builds assets/levels/lab-v5.json (shipped to the site). Offline, deterministic, no randomness.
//
//   node tools/build-lab-v5.js [--out assets/levels/lab-v5.json]
//
// Seven hand-drawn levels for the Lab tab that play the new Rules v5 tiles (docs/GAME_SPEC.md,
// "Rules v5"): ice twice, mud twice, gates twice, then one mix. The boards are drawn below by
// hand; everything else (par, parAnswers, the stored answer, its order) is computed by the engine.
// Each level stores "rules": "v5", wallBudget = par + 2, par (2 to 4), parAnswers (counted up to
// 50) and one par answer in "answer". The build throws if a level breaks one of these checks
// (tools/lab-v5.test.js repeats them on the shipped file):
//   - par 2 to 4;
//   - every mechanic on the board is load-bearing: swap its tiles for grass and the stored answer
//     stops winning or par changes;
//   - the stored answer can be placed in its stored order with no prefix cutting every route
//     (the UI refuses a cutting fence as it is placed, and hints place answer walls one at a time);
//   - the stored answer stays inside the two-sides cap of the start and the house.
// Across the pack, at least one ice level has a fence across a slide in its answer.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseLevel, solve, countAnswers, findPath, simulate, cutsAllRoutes, capViolation } from '../src/game/index.js';

/** The seven boards. `mech` is what the level teaches; `moveLimit` is how many moves the gnome has. */
export const BOARDS = [
  // Ice 1: a lane of ice across the middle. Fence the line below the ice he steps onto and he stops on it, then slides the long way round.
  { id: 'lab5-01', mech: ['ice'], moveLimit: 9, tiles: ['..R..', '.###.', '*****', '.###.', 'B....'] },
  // Ice 2: a short slide down the left edge. Three fences, one of them across the slide.
  { id: 'lab5-02', mech: ['ice'], moveLimit: 9, tiles: ['..B#.', '.#...', '*....', 'R.*..', '.....'] },
  // Mud 1: a mud tile beside the start. Stepping in costs 2 moves, so the route round the fences must dodge it or pay.
  { id: 'lab5-03', mech: ['mud'], moveLimit: 10, tiles: ['R&...', '#....', '.....', '.....', '..B..'] },
  // Mud 2: three mud tiles along the winding way home.
  { id: 'lab5-04', mech: ['mud'], moveLimit: 11, tiles: ['R#&..', '..#..', '#&...', '..&..', '....B'] },
  // Gate 1: left alone he walks round the gate; two fences send him the long way, up through it (the only way it opens).
  { id: 'lab5-05', mech: ['gate'], moveLimit: 8, tiles: ['.....', '....^', 'B##..', '...R.', '..#..'] },
  // Gate 2: two up-gates on his way home; the fences leave him only the gate that costs him most.
  { id: 'lab5-06', mech: ['gate'], moveLimit: 8, tiles: ['#...#', '.^.B.', '..^..', '.....', '.R..#'] },
  // Mix: ice, mud and a gate on one board; the answer's route goes through the gate.
  { id: 'lab5-07', mech: ['ice', 'mud', 'gate'], moveLimit: 12, tiles: ['.>.B.', '*.##.', '.&..#', '....R', '.#***'] },
];

const SWAP = { '*': '.', '&': '.', '>': '.', '<': '.', '^': '.', v: '.' };
const MECH_TILES = { ice: ['*'], mud: ['&'], gate: ['>', '<', '^', 'v'] };

export const makeRaw = (id, tiles, moveLimit, extra = {}) => ({
  id, size: tiles.length, tiles, rules: 'v5', moveLimit, wallBudget: 9, ...extra,
});

/** Does this wall set win (the gnome's route is longer than his moves, and he still has a route)? False if it is illegal. */
function wins(raw, walls) {
  try {
    const sim = simulate(parseLevel(raw), walls);
    return sim.result === 'win';
  } catch {
    return false;
  }
}

/** Some order of `answer` in which no prefix cuts every route and the side cap holds, or null. Tries the given order first. */
export function placeableOrder(level, answer) {
  const rest = (list, picked) => {
    if (list.length === 0) return picked;
    for (let i = 0; i < list.length; i++) {
      const next = [...picked, list[i]];
      if (cutsAllRoutes(level, next) || capViolation(level, next)) continue;
      const done = rest([...list.slice(0, i), ...list.slice(i + 1)], next);
      if (done) return done;
    }
    return null;
  };
  return rest(answer, []);
}

/** Lines of `answer` that a slide in the free route crosses (the start tile of the move to the last tile of its trail). */
export function slideLinesInAnswer(level, answer) {
  const free = findPath(level, []);
  if (!free || !free.trails) return [];
  const crossed = new Set();
  free.trails.forEach((trail, i) => {
    if (i === 0 || trail.length < 2) return;
    let prev = free.positions[i - 1];
    for (const t of trail) {
      const [x, y] = prev[0] < t[0] || prev[1] < t[1] ? prev : t; // the tile before the line, in canonical order
      crossed.add(prev[1] === t[1] ? `${x},${y},R` : `${x},${y},D`);
      prev = t;
    }
  });
  return answer.filter((w) => crossed.has(w.join(',')));
}

/**
 * Turn one drawn board into a finished level, or throw why it is not one. `spec` is
 * { id, mech, tiles, moveLimit }.
 */
export function buildLevel(spec) {
  const probe = parseLevel(makeRaw(spec.id, spec.tiles, spec.moveLimit));
  const s = solve(probe, { maxPar: 5 });
  if (!s) throw new Error(`${spec.id}: no wall set wins`);
  const par = s.par;
  if (par < 2 || par > 4) throw new Error(`${spec.id}: par ${par} is outside 2 to 4`);
  const raw = makeRaw(spec.id, spec.tiles, spec.moveLimit, { wallBudget: par + 2 });
  const level = parseLevel(raw);
  const parAnswers = countAnswers(level, par, 50);
  // Prefer an answer that can be placed in some order; the stored order is the order that works.
  const all = [];
  const answer = (() => {
    for (const cand of answersOf(level, par)) {
      const order = placeableOrder(level, cand);
      all.push(cand);
      if (order) return order;
    }
    return null;
  })();
  if (!answer) throw new Error(`${spec.id}: no par answer can be placed without a prefix cutting every route`);
  if (simulate(level, answer).result !== 'win') throw new Error(`${spec.id}: the stored answer does not win`);

  // Load-bearing: every mechanic present, swapped for grass, must change the verdict on the stored answer or the par.
  const loadBearing = {};
  for (const mech of spec.mech) {
    const swapped = spec.tiles.map((row) => [...row].map((c) => (MECH_TILES[mech].includes(c) ? SWAP[c] : c)).join(''));
    if (swapped.join('') === spec.tiles.join('')) throw new Error(`${spec.id}: no ${mech} tiles on the board`);
    const swapRaw = makeRaw(spec.id, swapped, spec.moveLimit, { wallBudget: par + 2 });
    let parChanged;
    try {
      const sw = solve(parseLevel(swapRaw), { maxPar: par + 1 });
      parChanged = !sw || sw.par !== par;
    } catch {
      parChanged = true; // the swapped board is not even a legal level
    }
    loadBearing[mech] = parChanged || !wins(swapRaw, answer);
    if (!loadBearing[mech]) throw new Error(`${spec.id}: ${mech} is not load-bearing (the answer still wins on grass and par is the same)`);
  }
  // A gate level must show the gate in use: the stored answer's route passes through a gate (QA 8d F1).
  if (spec.mech.includes('gate') && !simulate(level, answer).steps.some(([x, y]) => MECH_TILES.gate.includes(level.tile(x, y)))) {
    throw new Error(`${spec.id}: the stored answer never sends him through a gate`);
  }
  const slideFences = slideLinesInAnswer(level, answer);
  return { level: { ...raw, par, parAnswers, answer }, info: { loadBearing, slideFences } };
}

/** Every distinct par-sized winning set of buildable lines, in a fixed order (the search is exhaustive; boards are small). */
function* answersOf(level, k) {
  const first = solve(level, { exactPar: k });
  if (first) yield first.answer;
  // The solver gives one answer. If its order is not placeable in any order, look at the others by brute force over lines.
  const cand = [];
  const lns = candidateLines(level);
  const rec = (start, picked) => {
    if (picked.length === k) { if (wins(level, picked)) cand.push([...picked]); return; }
    for (let i = start; i < lns.length; i++) { picked.push(lns[i]); rec(i + 1, picked); picked.pop(); }
  };
  if (!first || !placeableOrder(level, first.answer)) rec(0, []);
  for (const c of cand) yield c;
}
function candidateLines(level) {
  const out = [];
  for (let y = 0; y < level.size; y++) for (let x = 0; x < level.size; x++) {
    if (x < level.size - 1 && level.lineBuildable(x, y, 'R')) out.push([x, y, 'R']);
    if (y < level.size - 1 && level.lineBuildable(x, y, 'D')) out.push([x, y, 'D']);
  }
  return out;
}

export function buildLabV5(log = () => {}) {
  const levels = [];
  const infos = [];
  for (const spec of BOARDS) {
    const { level, info } = buildLevel(spec);
    levels.push(level);
    infos.push(info);
    log(`${level.id} ${level.size}x${level.size} ${spec.mech.join('+')} par ${level.par} parAnswers ${level.parAnswers} moveLimit ${level.moveLimit} slideFences ${info.slideFences.length}`);
  }
  if (!infos.some((info, i) => BOARDS[i].mech.includes('ice') && info.slideFences.length > 0)) {
    throw new Error('no ice level has a fence across a slide in its answer');
  }
  return { id: 'lab-v5', rules: 'v5', levels };
}

function main() {
  const args = process.argv.slice(2);
  const here = dirname(fileURLToPath(import.meta.url));
  let out = resolve(here, '../assets/levels/lab-v5.json');
  if (args[0] === '--out') out = resolve(args[1]);
  const pack = buildLabV5((m) => console.log(m));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(pack, null, 1) + '\n');
  console.log(`wrote ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
