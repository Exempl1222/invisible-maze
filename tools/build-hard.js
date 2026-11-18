#!/usr/bin/env node
// Builds assets/levels/hard.json: the 20 Hard 9x9 levels, Play levels 41 to 60 (docs/GAME_SPEC.md "Rules v5": Tiers, Gnome tools, Design metrics).
//
//   node tools/build-hard.js                     default: rebuild the pack from the frozen boards below (well under 2 minutes, no search)
//   node tools/build-hard.js --search n [n ...]  documented, seeded generator for the Play levels n (41 to 60). Multi-core (worker threads),
//                                                HARD_SECONDS = time limit per slot, HARD_SEED_TAG = a different walk of the seeds,
//                                                HARD_NODES = work budget per solve, HARD_WORKERS = threads.
//                                                Prints the funnel and the board as a JSON line to paste into BOARDS. Slow; never run by the tests.
//
// Rules v5, budget = par + 2, one tool per level. Each frozen board (tiles + move limit; the tool comes from the slot) goes through the engine
// for par, parAnswers and the stored answer, and the build throws unless the Hard design metrics hold (tools/hard.test.js repeats them on the file):
//   ladder 41-45 (par 4,4,5,5,5)  pickaxe 46-50 (4,5,5,5,6)  plank 51-55 (5,5,5,6,6)  mixes 56-60 with Medium tiles (5,6,6,6,7)
//   41, 46, 51: only their tool (no ice, mud, gates).  Slack 5 to 10.  The stored answer is placeable in its stored order, uses the tool,
//   and he has a tool-free route with no fences.  The tool decides par on 41, 46, 51 and on at least 15 of 20.  Par answers: at most 10 on
//   41/46/51, 20 elsewhere, 12 on 56-60, 5 on 60.  Mixes: ice seen sliding, gates in use, density, each tile type load-bearing.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { parseLevel, findPath, solve, countAnswers, simulate, capViolation, createRng } from '../src/game/index.js';
import { placeableOrder } from './build-lab-v5.js';
import { invalidBridges } from './generate.js';

const SIZE = 9;
export const NODES = 400000; // work budget for every solve and count the default build does
const SEARCH_NODES = Number(process.env.HARD_NODES || 40000);
const MECH_TILES = { ice: '*', mud: '&', gate: '><^v' };
export const mechsOf = (tiles) => Object.keys(MECH_TILES).filter((m) => [...MECH_TILES[m]].some((c) => tiles.join('').includes(c)));
export const countTiles = (tiles, chars) => [...tiles.join('')].filter((c) => chars.includes(c)).length;

// One slot per level, in Play order (41 to 60). tool: the level's tool; mech: Medium tiles on the board (exactly these); par: wanted par.
export const SLOTS = [
  { tool: 'ladder', mech: [], par: 4, intro: true }, { tool: 'ladder', mech: [], par: 4 }, { tool: 'ladder', mech: [], par: 5 },
  { tool: 'ladder', mech: [], par: 5 }, { tool: 'ladder', mech: [], par: 5 },
  { tool: 'pickaxe', mech: [], par: 4, intro: true }, { tool: 'pickaxe', mech: [], par: 5 }, { tool: 'pickaxe', mech: [], par: 5 },
  { tool: 'pickaxe', mech: [], par: 5 }, { tool: 'pickaxe', mech: [], par: 6 },
  { tool: 'plank', mech: [], par: 5, intro: true }, { tool: 'plank', mech: [], par: 5 }, { tool: 'plank', mech: [], par: 5 },
  { tool: 'plank', mech: [], par: 6 }, { tool: 'plank', mech: [], par: 6 },
  { tool: 'ladder', mech: ['ice'], par: 5 }, { tool: 'ladder', mech: ['mud'], par: 6 }, { tool: 'plank', mech: ['gate'], par: 6 },
  { tool: 'ladder', mech: ['ice', 'gate'], par: 6 }, { tool: 'plank', mech: ['ice', 'mud'], par: 7 },
];
export const parCap = (i) => (SLOTS[i].intro ? 10 : i === 19 ? 5 : i >= 15 ? 12 : 20);
const GROUPS = [[0, 4], [5, 9], [10, 14], [15, 19]];
const D = { ice: [3, 8], mud: [2, 5], gate: [1, 3] };
const idOf = (i) => `hard-${String(i + 1).padStart(2, '0')}`;

/** Two boards of one group that would feel like the same level: under 24 of 81 tiles differ in any of the 8 turns and flips (gate arrows count as one kind). */
export function lookAlike(a, b) {
  const grid = (t) => t.map((r) => [...r].map((c) => ('><^v'.includes(c) ? 'g' : c)));
  const turn = (g) => g[0].map((_, x) => g.map((row) => row[x]).reverse());
  const flip = (g) => g.map((r) => r.slice().reverse());
  let g = grid(a);
  const ref = grid(b).flat();
  for (let i = 0; i < 4; i++, g = turn(g)) {
    for (const v of [g, flip(g)]) if (v.flat().filter((c, k) => c !== ref[k]).length < 24) return true;
  }
  return false;
}

const rawOf = (id, tiles, tool, moveLimit, wallBudget) => ({ id, size: SIZE, tiles, rules: 'v5', tool, moveLimit, wallBudget });
const baseRoute = (level) => findPath(level, []).positions.length - 1;
export const slackOf = (level) => level.moveLimit - baseRoute(parseLevel(level));

/** Does `answer` still win on this raw level? False if illegal. */
function winsOn(raw, answer) {
  try { return simulate(parseLevel(raw), answer).result === 'win'; } catch { return false; }
}
/** Does the tool decide par: without it par changes (or no answer within par). `null` when the work budget ran out (unknown). */
export function toolDecidesPar(raw, par, maxNodes = NODES) {
  const { tool: _t, ...noTool } = raw;
  const lv = parseLevel(noTool);
  const s = solve(lv, { maxPar: par, maxNodes });
  if (s) return s.par !== par;
  // null: either no answer within par (par is higher or none) or the budget ran out. A run with no budget would be unbounded, so say "unknown" only if cheap.
  return solve(lv, { maxPar: par, maxNodes: maxNodes * 4 }) === null ? true : null;
}
/** Is a Medium mechanic load-bearing (its tiles to grass: the stored answer stops winning, or par falls). */
export function loadBearing(raw, mech, par, answer, maxNodes = NODES) {
  const tiles = raw.tiles.map((r) => [...r].map((c) => (MECH_TILES[mech].includes(c) ? '.' : c)).join(''));
  const sw = { ...raw, tiles };
  if (!winsOn(sw, answer)) return true;
  return par > 0 && solve(parseLevel(sw), { maxPar: par - 1, maxNodes }) !== null;
}
export function slidesInAnswer(level) {
  const r = simulate(parseLevel(level), level.answer);
  return (r.trails || []).filter((t) => t.length >= 2).length;
}
export function visited(level) {
  const lv = parseLevel(level);
  return simulate(lv, level.answer).steps.map(([x, y]) => lv.tile(x, y));
}
/** Index in the replay's positions where the answer makes him use the tool, or null. */
export const toolStepOf = (level) => simulate(parseLevel(level), level.answer).toolStep;

/** Turn one frozen board into a finished level, or throw why it is not one. */
export function buildLevel(slot, board, id, nodes = NODES) {
  const raw0 = rawOf(id, board.tiles, slot.tool, board.moveLimit, 99);
  const s = solve(parseLevel(raw0), { maxPar: slot.par, maxNodes: nodes });
  if (!s || s.par !== slot.par) throw new Error(`${id}: par is not ${slot.par}`);
  const par = s.par;
  const raw = { ...raw0, wallBudget: par + 2 };
  const level = parseLevel(raw);
  const answer = placeableOrder(level, s.answer);
  if (!answer) throw new Error(`${id}: the par answer cannot be placed without a prefix cutting every route`);
  const parAnswers = countAnswers(level, par, 50, { maxNodes: nodes });
  if (parAnswers === null) throw new Error(`${id}: parAnswers ran out of work`);
  const lb = {};
  for (const m of slot.mech) lb[m] = loadBearing(raw, m, par, answer, nodes);
  const decides = toolDecidesPar(raw, par, nodes);
  if (decides === null) throw new Error(`${id}: could not tell whether the tool decides par within the work budget`);
  return { level: { ...raw, par, parAnswers, answer }, info: { loadBearing: lb, decides } };
}

/** Throws unless the levels meet the Hard design metrics. `infos` (from buildLevel) carries the verdicts. */
export function checkHard(levels, infos) {
  const seen = new Set();
  let decide = 0;
  if (levels.length !== 20) throw new Error('hard: need 20 levels');
  levels.forEach((l, i) => {
    const n = i + 41, slot = SLOTS[i];
    if (l.id !== idOf(i)) throw new Error(`hard ${n}: id`);
    if (l.rules !== 'v5' || l.size !== SIZE) throw new Error(`hard ${n}: rules or size`);
    if (l.tool !== slot.tool) throw new Error(`hard ${n}: tool ${l.tool}`);
    if (l.wallBudget !== l.par + 2) throw new Error(`hard ${n}: budget`);
    if (l.par !== slot.par) throw new Error(`hard ${n}: par ${l.par}, wanted ${slot.par}`);
    if (JSON.stringify(mechsOf(l.tiles)) !== JSON.stringify(Object.keys(MECH_TILES).filter((m) => slot.mech.includes(m)))) throw new Error(`hard ${n}: mechanics ${mechsOf(l.tiles)}`);
    if (seen.has(l.tiles.join('/'))) throw new Error(`hard ${n}: duplicate board`);
    seen.add(l.tiles.join('/'));
    const [from] = GROUPS.find(([a, b]) => i >= a && i <= b);
    for (let m = from; m < i; m++) if (lookAlike(levels[m].tiles, l.tiles)) throw new Error(`hard ${n}: looks like hard ${m + 41}`);
    const slack = slackOf(l);
    if (slack < 5 || slack > 10) throw new Error(`hard ${n}: slack ${slack}`);
    for (const m of slot.mech) {
      const c = countTiles(l.tiles, MECH_TILES[m]);
      if (c < D[m][0] || c > D[m][1]) throw new Error(`hard ${n}: ${c} ${m} tiles`);
      if (!infos[i].loadBearing[m]) throw new Error(`hard ${n}: ${m} is not load-bearing`);
    }
    if (l.parAnswers > parCap(i)) throw new Error(`hard ${n}: ${l.parAnswers} par answers, at most ${parCap(i)}`);
    if (infos[i].decides) decide++;
    else if (slot.intro) throw new Error(`hard ${n}: intro level: par is the same without the ${slot.tool}`);
    if (invalidBridges(l.tiles).length) throw new Error(`hard ${n}: a bridge does not span a river`);
    const lv = parseLevel(l);
    if (l.answer.length !== l.par || simulate(lv, l.answer).result !== 'win') throw new Error(`hard ${n}: stored answer`);
    if (capViolation(lv, l.answer)) throw new Error(`hard ${n}: side cap`);
    if (toolStepOf(l) == null) throw new Error(`hard ${n}: the stored answer's replay does not use the ${slot.tool}`);
    if (findPath(lv, []).toolFreeRoute === false) throw new Error(`hard ${n}: no tool-free route`);
    if (slot.mech.includes('ice') && !slidesInAnswer(l)) throw new Error(`hard ${n}: ice level, but the answer's replay has no slide`);
    if (slot.mech.includes('gate') && !visited(l).some((c) => '><^v'.includes(c))) throw new Error(`hard ${n}: the gnome does not pass a gate when the answer is played`);
  });
  if (decide < 15) throw new Error(`hard: the tool decides par on only ${decide} of 20 levels`);
  return { decide };
}

export function buildHard(log = () => {}) {
  const built = BOARDS.map((b, i) => buildLevel(SLOTS[i], b, idOf(i)));
  const levels = built.map((b) => b.level);
  const stats = checkHard(levels, built.map((b) => b.info));
  built.forEach(({ level: l, info }, i) => log(`${l.id} ${l.tool} ${SLOTS[i].mech.join('+')} par ${l.par} parAnswers ${l.parAnswers} moveLimit ${l.moveLimit} slack ${slackOf(l)} toolStep ${toolStepOf(l)} decides ${info.decides} ${JSON.stringify(info.loadBearing)}`));
  log(`the tool decides par on ${stats.decide} of 20`);
  return { pack: { id: 'hard', levels }, stats };
}

// ---------------------------------------------------------------------------------------------------------------------------
// The generator (--search). Seeded: candidate i of a slot is createRng(`hard-<slot><tag>:<i>`), so a run is repeatable.
const ARROW = { '0,-1': '^', '1,0': '>', '0,1': 'v', '-1,0': '<' };
const turnGrid = (g) => g[0].map((_, x) => g.map((row) => row[x]));

export const terrainForProbe = (rng, slot) => terrain(rng, slot);
function terrain(rng, slot) {
  const N = SIZE;
  let g = Array.from({ length: N }, () => Array(N).fill('.'));
  const cells = (c = '.') => g.flatMap((row, y) => row.map((v, x) => (v === c ? [x, y] : null)).filter(Boolean));
  let start, beacon;
  const dense = rng.chance(0.5);
  if (slot.tool === 'plank') {
    // a river running top to bottom with 1 or 2 bridges; start left of it, house right of it
    let rx = rng.int(2, 6);
    for (let y = 0; y < N; y++) {
      if (y > 0 && rng.chance(0.5)) { const nx = Math.max(2, Math.min(N - 3, rx + (rng.chance(0.5) ? 1 : -1))); g[y - 1][nx] = '~'; rx = nx; }
      g[y][rx] = '~';
    }
    for (let k = rng.int(8, 16); k > 0; k--) { const [x, y] = rng.pick(cells()); g[y][x] = '#'; }
    const spots = rng.shuffle(cells('~').filter(([x, y]) => g[y][x - 1] && g[y][x - 1] !== '~' && g[y][x + 1] && g[y][x + 1] !== '~' && g[y - 1]?.[x] === '~' && g[y + 1]?.[x] === '~'));
    const want = rng.int(1, 2), used = [];
    for (const [x, y] of spots) {
      if (used.length >= want) break;
      if (used.some((u) => Math.abs(u - y) < 3)) continue;
      used.push(y); g[y][x] = '=';
      if (g[y][x - 1] === '#') g[y][x - 1] = '.';
      if (g[y][x + 1] === '#') g[y][x + 1] = '.';
    }
    if (!used.length) return null;
    const rxs = (y) => g[y].map((c, x) => (c === '~' || c === '=' ? x : -1)).filter((x) => x >= 0);
    const left = cells().filter(([x, y]) => x < Math.min(...rxs(y)));
    const right = cells().filter(([x, y]) => x > Math.max(...rxs(y)));
    if (!left.length || !right.length) return null;
    start = rng.pick(left); beacon = rng.pick(right);
  } else if (slot.tool === 'pickaxe') {
    // one or two full rock walls (one tile thick) across the board, each with a single gap near an end: the way round is long, the pickaxe cuts through
    const nw = rng.int(1, 2);
    const cols = nw === 1 ? [rng.int(3, 5)] : [rng.int(2, 3), rng.int(5, 6)];
    cols.forEach((c, k) => {
      const gap = (k + rng.int(0, 1)) % 2 === 0 ? rng.int(0, 1) : rng.int(N - 2, N - 1);
      for (let y = 0; y < N; y++) if (y !== gap) g[y][c] = '#';
    });
    for (let r = rng.int(4, 9); r > 0; r--) { const [x, y] = rng.pick(cells()); g[y][x] = '#'; }
    const left = cells().filter(([x]) => x < cols[0]);
    const right = cells().filter(([x]) => x > cols[cols.length - 1]);
    if (!left.length || !right.length) return null;
    start = rng.pick(left); beacon = rng.pick(right);
  } else {
    // ladder: one or two full rock walls with two or three gaps each, in open grass; start and house on opposite sides
    const nw = rng.int(1, 2);
    const cols = nw === 1 ? [rng.int(3, 5)] : [rng.int(2, 3), rng.int(5, 6)];
    cols.forEach((c) => {
      const gaps = rng.shuffle([...Array(N).keys()]).slice(0, rng.int(2, 3));
      for (let y = 0; y < N; y++) if (!gaps.includes(y)) g[y][c] = '#';
    });
    for (let r = rng.int(6, 13); r > 0; r--) { const [x, y] = rng.pick(cells()); g[y][x] = '#'; }
    const left = cells().filter(([x]) => x < cols[0]);
    const right = cells().filter(([x]) => x > cols[cols.length - 1]);
    if (!left.length || !right.length) return null;
    start = rng.pick(left); beacon = rng.pick(right);
  }
  if (Math.abs(start[0] - beacon[0]) + Math.abs(start[1] - beacon[1]) < 8) return null;
  g[start[1]][start[0]] = 'R';
  g[beacon[1]][beacon[0]] = 'B';
  if (rng.chance(0.5)) g = turnGrid(g);
  if (rng.chance(0.5)) g = g.map((r) => r.slice().reverse());
  if (rng.chance(0.5)) g = g.slice().reverse();
  const free = () => g.flatMap((row, y) => row.map((c, x) => (c === '.' ? [x, y] : null)).filter(Boolean));
  const mech = slot.mech;
  if (mech.includes('ice')) {
    let want = rng.int(3, 8);
    for (let lane = 0; lane < 2 && want >= 3; lane++) {
      const len = Math.min(N, lane === 1 ? want : Math.min(want, rng.int(3, 6)));
      const vert = rng.chance(0.5), at = rng.int(0, N - 1), from = rng.int(0, N - len);
      const run = Array.from({ length: len }, (_, k) => (vert ? [at, from + k] : [from + k, at]));
      if (!run.every(([x, y]) => g[y][x] === '.')) continue;
      run.forEach(([x, y]) => { g[y][x] = '*'; });
      want -= len;
      if (rng.chance(0.4)) break;
    }
  }
  if (mech.includes('mud')) {
    for (let m = rng.int(2, 5); m > 0; m--) { const [x, y] = rng.pick(free()); g[y][x] = '&'; }
  }
  if (mech.includes('gate')) {
    let route = null;
    try { route = findPath(parseLevel({ size: N, tiles: g.map((r) => r.join('')), rules: 'v5', moveLimit: 1, wallBudget: 0 }), []); } catch { /* none */ }
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
  const rows = g.map((r) => r.join(''));
  return invalidBridges(rows).length ? null : rows;
}

/** One candidate for a slot, or null. Cheap checks first; the solver last, always with a work budget. */
function candidate(slot, rng, tag, F, used = []) {
  F('tried');
  const tiles = terrain(rng, slot);
  if (!tiles) return null;
  if (used.some((u) => lookAlike(u, tiles))) { F('lookalike'); return null; } // cheap: before any solve
  for (const m of slot.mech) { const c = countTiles(tiles, MECH_TILES[m]); if (c < D[m][0] || c > D[m][1]) return null; }
  F('terrain');
  let probe, noTool;
  try {
    probe = parseLevel(rawOf(tag, tiles, slot.tool, 1, 0));
    noTool = parseLevel({ ...rawOf(tag, tiles, slot.tool, 1, 0), tool: undefined });
  } catch { return null; }
  const free = findPath(probe, []);
  if (!free || free.toolFreeRoute === false) return null;
  const freeCost = free.positions.length - 1;
  const plain = findPath(noTool, []);
  if (!plain) return null;
  if (slot.tool !== 'ladder' && !(freeCost < plain.positions.length - 1)) return null; // the tool must matter with no fences
  if (freeCost < 6) return null;
  F('route');
  // par only rises with the move limit: walk the slack up from 5 until par reaches the wanted value (null: it is already higher, or out of work)
  let s = null, raw, lv, moveLimit;
  for (let slack = 5; slack <= 10; slack++) {
    moveLimit = freeCost + slack;
    raw = rawOf(tag, tiles, slot.tool, moveLimit, slot.par + 2);
    lv = parseLevel(raw);
    s = solve(lv, { maxPar: slot.par, maxNodes: SEARCH_NODES });
    if (!s || s.par === slot.par) break;
  }
  if (!s || s.par !== slot.par) return null;
  F('par');
  const answer = placeableOrder(lv, s.answer);
  if (!answer) return null;
  const sim = simulate(lv, answer);
  if (sim.toolStep == null) return null;
  if (slot.mech.includes('gate') && !visited({ ...raw, answer }).some((c) => '><^v'.includes(c))) return null;
  if (slot.mech.includes('ice') && !slidesInAnswer({ ...raw, answer })) return null;
  F('placeable_tooluse');
  const parAnswers = countAnswers(lv, s.par, 50, { maxNodes: SEARCH_NODES * 4 });
  if (parAnswers === null || parAnswers > parCap(slot.index)) return null;
  F('cap');
  const d = toolDecidesPar(raw, s.par, SEARCH_NODES);
  if (d !== true) return null;
  F('decides');
  for (const m of slot.mech) if (!loadBearing(raw, m, s.par, answer, SEARCH_NODES)) return null;
  F('loadbearing');
  return { tiles, moveLimit, par: s.par, parAnswers, toolStep: sim.toolStep };
}

if (!isMainThread && workerData?.hard) {
  // worker: walk candidates w, w + W, w + 2W ... of one slot until a hit or the deadline
  const { slot, si, tag, w, W, deadline, used } = workerData;
  const funnel = {};
  const F = (k) => { funnel[k] = (funnel[k] || 0) + 1; };
  let tried = 0;
  for (let i = w; Date.now() < deadline; i += W) {
    tried++;
    const c = candidate({ ...slot, index: si }, createRng(`hard-${si + 41}${tag}:${i}`), `h${si}`, F, used);
    if (!c) continue;
    if (used.some((u) => lookAlike(u, c.tiles))) { F('lookalike'); continue; }
    parentPort.postMessage({ hit: c, i, funnel, tried });
    break;
  }
  parentPort.postMessage({ done: true, funnel, tried });
}

async function searchSlot(si, used, log) {
  const W = Number(process.env.HARD_WORKERS || 4);
  const secs = Number(process.env.HARD_SECONDS || 1200);
  const tag = process.env.HARD_SEED_TAG || '';
  const deadline = Date.now() + secs * 1000;
  const t0 = Date.now();
  const workers = [], funnel = {};
  let hit = null, tried = 0, left = W;
  await new Promise((done) => {
    for (let w = 0; w < W; w++) {
      const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { hard: true, slot: SLOTS[si], si, tag, w, W, deadline, used } });
      workers.push(wk);
      wk.on('message', (m) => {
        if (m.hit && !hit) { hit = m.hit; workers.forEach((x) => x.terminate()); done(); }
        if (m.done) { tried += m.tried; for (const [k, v] of Object.entries(m.funnel)) funnel[k] = (funnel[k] || 0) + v; if (--left === 0) done(); }
      });
      wk.on('error', (e) => { log(`# worker error ${e.message}`); if (--left === 0) done(); });
    }
  });
  log(`# slot ${si + 41} ${SLOTS[si].tool} ${SLOTS[si].mech} par ${SLOTS[si].par}: ${Math.round((Date.now() - t0) / 1000)} s, funnel (finished workers) ${JSON.stringify(funnel)}`);
  if (!hit) { log(`# slot ${si + 41}: nothing found`); return null; }
  log(JSON.stringify({ slot: si + 41, tool: SLOTS[si].tool, moveLimit: hit.moveLimit, tiles: hit.tiles }) + ` // par ${hit.par} parAnswers ${hit.parAnswers} toolStep ${hit.toolStep}`);
  return hit;
}

async function search(nums, log) {
  for (const n of nums) {
    const si = n - 41;
    const used = BOARDS.filter((b, bi) => b && bi !== si && GROUPS.some(([a, z]) => si >= a && si <= z && bi >= a && bi <= z)).map((b) => b.tiles);
    const hit = await searchSlot(si, used, log);
    if (hit) { BOARDS[si] = { moveLimit: hit.moveLimit, tiles: hit.tiles }; }
  }
}

// BOARDS-BEGIN (frozen search results; edit only by pasting --search output; the comment gives par, parAnswers and tool step)
export const BOARDS = [
  { moveLimit: 14, tiles: ['.........', '.........', '#.R......', '.........', '.........', '#........', '####.##.#', '.........', '....B....'] }, // 41: par 4 parAnswers 7 toolStep 2
  { moveLimit: 14, tiles: ['R......#.', '.........', '...#.....', '##...####', '.........', '#..######', '#..B#..#.', '.#.......', '##..#...#'] }, // 42: par 4 parAnswers 4 toolStep 12
  { moveLimit: 13, tiles: ['#.......#', '#...#...#', '.#.....R.', '####.##.#', '........#', '#........', '......#..', '#...#....', '..#..B..#'] }, // 43: par 5 parAnswers 13 toolStep 8
  { moveLimit: 13, tiles: ['...R.....', '.........', '.#.#.....', '......#.#', '....#.#..', '##.##.###', '.........', '#.B..#...', '...#.....'] }, // 44: par 5 parAnswers 8 toolStep 12
  { moveLimit: 16, tiles: ['#...#....', '##.......', '...##....', '#..##....', '...R.....', '.#..##...', '....##...', '.#......B', '#...#....'] }, // 45: par 5 parAnswers 4 toolStep 2
  { moveLimit: 14, tiles: ['.........', '.........', '..B.#....', '.########', '........R', '.......#.', '.#.......', '.....#...', '#........'] }, // 46: par 4 parAnswers 10 toolStep 14
  null, // 47
  null, // 48
  null, // 49
  null, // 50
  { moveLimit: 14, tiles: ['...~.....', '.#.=.....', '..B~.....', '..#~.....', '..~~.....', '..~......', '..~...R..', '..=......', '..~......'] }, // 51: par 5 parAnswers 1 toolStep 5
  { moveLimit: 13, tiles: ['..#..#~..', '.#....~..', '.#...#~..', '.#B...~..', '.#....~..', '..#...~.#', '##....~R.', '##....=..', '....##~..'] }, // 52: par 5 parAnswers 7 toolStep 6
  null, // 53
  null, // 54
  null, // 55
  { moveLimit: 12, tiles: ['....#...*', '.B...##.*', '#...*...*', '..#.*...*', '..#.*....', '....*...#', '.........', '.........', '.....R...'] }, // 56: par 5 parAnswers 2 toolStep 2
  null, // 57
  null, // 58
  null, // 59
  null, // 60
];
// BOARDS-END

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--search') { await search(args.slice(1).map(Number), (m) => console.log(m)); return; }
  const t0 = Date.now();
  const { pack } = buildHard((m) => console.log(m));
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/levels/hard.json');
  writeFileSync(out, JSON.stringify(pack, null, 2) + '\n');
  console.log(`wrote ${out} in ${Date.now() - t0} ms`);
}

if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
