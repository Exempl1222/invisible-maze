// Exact solver: par (fewest winning walls) and answer counting. Pure.
//
// Rules v4 adds a side cap (at most SIDE_CAP walls touching the start, same for the beacon). It is
// part of legality: a set over the cap is illegal and no superset fixes it (counts only grow),
// so the search treats it like a cut state and never branches into it.
//
// Rules v5 (ice, mud, gates) breaks two of the facts below, because a fence can stop a slide on a
// tile with a way on: adding a fence can SHORTEN the cheapest route and can RECONNECT a cut board.
// So under v5: (1) a cut state is not a dead end, it branches on every unchosen buildable line;
// (2) the packing lower bound is off (it assumes monotone routes); (3) a state that wins with fewer
// than k walls does not make every k-superset a winner, so countAnswers checks each one. What stays
// sound is branching on the lines the current cheapest route crosses: if a winning set W contains
// the current set S but none of those lines, the same route survives under W (a new fence off the
// route changes none of its moves, and the fences that stop its slides are still there), so W
// would not win. The v4 side cap still applies (a set over the cap has no legal superset).
// Only ice breaks monotonicity: on a v5 board with no ice tile (mud, gates, teleports and the gnome
// tools all only remove or lengthen options when a fence is added) the v4 facts hold again, so
// `monotone` boards get the cut-state prune and the packing bound back (tools-brute and v5-brute check it).
//
// A wall set wins only if it leaves the robot a route AND that route is longer than the move
// limit (rules v3.1: cutting every route is illegal). Key facts:
//  - A winning set must contain a buildable line the robot's current shortest route crosses
//    (otherwise that route survives and fits the limit; each move crosses one line, a
//    teleport jump crosses none). Branch only on those lines.
//  - Adding walls never shortens a route and never reconnects a cut, so a disconnected state
//    is a dead end: prune it. A connected state with a too-long route wins.
import { routeWithMask } from './path.js';
import { buildableLines, lineIndex, lineWall, SIDE_CAP } from './level.js';

/**
 * Wins only with a route left that is longer than the limit. A null route is illegal. Gnome tools:
 * the no-cut rule ignores the tool, so a set that leaves only a tool route is illegal too.
 */
function isWin(level, route) {
  return route !== null && route.toolFreeRoute !== false && route.positions.length - 1 > level.moveLimit;
}

/**
 * Lower bound on extra walls needed from this state: the number of routes that fit the move limit
 * and share no buildable line (found greedily; a route's buildable lines are walled in a copy
 * before looking for the next). Every winning superset must put a wall on each of those routes,
 * and one wall can sit on only one of them, so at least this many more walls are needed.
 * Returns Infinity if a short route has no buildable line (nothing can ever block it). Stops
 * early once the count passes `rem`, since the state is then dead.
 */
function packingBound(level, mask, buildable, rem, ice = null) {
  const tmp = mask.slice();
  let count = 0;
  for (;;) {
    const r = routeWithMask(level, tmp);
    if (r === null || r.positions.length - 1 > level.moveLimit) return count;
    // Ice board (`ice` = per-cell flags): a later route is found with the earlier routes' lines fenced in a copy, and a
    // copy fence can stop a slide that the real fences would not, so that route may not exist for real. Count it only
    // if it is real for sure: no move ends on an ice tile beside a copy-only fence, and no ladder (it may climb a copy fence).
    if (ice && count > 0 && !realRoute(level, r, tmp, mask, ice)) return count;
    let any = false;
    for (const i of r.lines) {
      if (buildable[i]) { tmp[i] = 1; any = true; }
    }
    if (!any) return Infinity;
    if (++count > rem) return count;
  }
}

/** Ice boards, packing bound: does route r (found under the copy fences `tmp`) make the same moves under the real `mask`? Conservative. */
function realRoute(level, r, tmp, mask, ice) {
  if (level.tool === 'ladder' && r.toolStep !== null && r.toolStep !== undefined) return false;
  const { size } = level;
  for (let i = 1; i < r.positions.length; i++) {
    const [x, y] = r.positions[i];
    if (!ice[y * size + x]) continue;
    // the four lines around this tile: R and D of it, R of the left tile, D of the tile above
    const around = [];
    if (x < size - 1) around.push(lineIndex(level, x, y, 'R'));
    if (y < size - 1) around.push(lineIndex(level, x, y, 'D'));
    if (x > 0) around.push(lineIndex(level, x - 1, y, 'R'));
    if (y > 0) around.push(lineIndex(level, x, y - 1, 'D'));
    if (around.some((l) => tmp[l] && !mask[l])) return false;
  }
  return true;
}

function setup(level) {
  const buildable = new Uint8Array(level.size * level.size * 2);
  const pool = [];
  for (const [x, y, dir] of buildableLines(level)) {
    const i = lineIndex(level, x, y, dir);
    buildable[i] = 1;
    pool.push(i);
  }
  // touch[i]: bit 1 = the line touches the robot start, bit 2 = it touches the beacon (v4 cap).
  const touch = new Uint8Array(level.size * level.size * 2);
  for (const i of pool) {
    const [x, y, dir] = lineWall(level, i);
    for (const [tx, ty] of [[x, y], dir === 'R' ? [x + 1, y] : [x, y + 1]]) {
      if (tx === level.start[0] && ty === level.start[1]) touch[i] |= 1;
      if (tx === level.beacon[0] && ty === level.beacon[1]) touch[i] |= 2;
    }
  }
  // Counts of chosen walls touching the start / beacon. take() refuses a line that would break the cap.
  const cnt = { start: 0, beacon: 0 };
  const capped = level.rules === 'v4' || level.rules === 'v5';
  const take = (i) => {
    if (capped) {
      const s = touch[i] & 1;
      const b = (touch[i] >> 1) & 1;
      if (cnt.start + s > SIDE_CAP || cnt.beacon + b > SIDE_CAP) return false;
      cnt.start += s;
      cnt.beacon += b;
    }
    return true;
  };
  const drop = (i) => {
    if (capped) {
      cnt.start -= touch[i] & 1;
      cnt.beacon -= (touch[i] >> 1) & 1;
    }
  };
  const monotone = level.rules !== 'v5' || !level.grid.some((row) => row.includes('*'));
  // Ice boards: per-cell ice flags, and the buildable lines with an ice tile on a side. Only a fence on one of
  // those can stop a slide (every other fence only blocks moves), so only those can reconnect a cut board.
  const ice = monotone ? null : Uint8Array.from(level.grid.flat(), (c) => (c === '*' ? 1 : 0));
  const iceLines = monotone ? null : pool.filter((i) => {
    const [x, y, dir] = lineWall(level, i);
    const [x2, y2] = dir === 'R' ? [x + 1, y] : [x, y + 1];
    return ice[y * level.size + x] || ice[y2 * level.size + x2];
  });
  return { buildable, pool, take, drop, monotone, ice, iceLines };
}
/** Dead end on a monotone board: no tool-free route, and more fences can never bring one back. */
const deadCut = (route) => route === null || route.toolFreeRoute === false;

/**
 * Rules v5: the lines to branch on. A route may cross a line twice; a cut board allows any line.
 * Gnome tools: a board with only a tool route (no tool-free route, toolFreeRoute false) is cut for the
 * no-cut rule, so any line may reconnect it (like a null route). Otherwise the cheapest route R
 * (tool included) fits the limit or the set would already win; any winning superset W that adds no
 * fence on R's lines leaves R intact (a ladder still has its fence; pickaxe and plank steps cross no
 * buildable line), so W's cheapest route is no longer than R and W does not win. R's ladder line is
 * already fenced, so it is skipped.
 */
function branchLines(route, pool, mask, iceLines) {
  // Cut: a winning superset must add a fence that brings a route back, and only a fence beside ice can (it stops a slide).
  if (route === null || route.toolFreeRoute === false) return (iceLines ?? pool).filter((i) => !mask[i]);
  return [...new Set(route.lines)].filter((i) => !mask[i]);
}

function toWalls(level, idxs) {
  return idxs.slice().sort((a, b) => a - b).map((i) => lineWall(level, i));
}

/**
 * @param {object} level parsed level
 * @param {{maxPar?: number, maxNodes?: number, exactPar?: number}} [opts] give up (return null) beyond this many walls, or after
 *   exploring this many search states (a deterministic work budget for the offline generator; null then means "not found").
 *   `exactPar`: search only at this many walls, skipping the shallower searches (for a client that already knows par, so
 *   the answer is not shipped). At the true par it returns exactly what the full solve returns; below it, null.
 * @returns {{par:number, answer:number[][]} | null} answer is [x, y, "R"|"D"] walls; null if no wall set wins
 */
export function solve(level, opts = {}) {
  if (opts.exactPar !== undefined && (!Number.isInteger(opts.exactPar) || opts.exactPar < 0)) {
    throw new Error(`exactPar must be a non-negative integer, got ${opts.exactPar}`);
  }
  const { buildable, pool, take, drop, monotone, ice, iceLines } = setup(level);
  const v5 = level.rules === 'v5';
  const limit = Math.min(pool.length, opts.exactPar ?? opts.maxPar ?? Infinity);
  const mask = new Uint8Array(level.size * level.size * 2);
  const chosen = [];
  let seen;

  let nodes = 0;
  const maxNodes = opts.maxNodes ?? Infinity;
  const OUT_OF_WORK = Symbol('out of work');

  function dfs(rem) {
    if (++nodes > maxNodes) throw OUT_OF_WORK;
    const route = routeWithMask(level, mask);
    if (monotone && deadCut(route)) return false; // every route cut: illegal, and more walls can't undo it
    if (route !== null && isWin(level, route)) return true;
    if (rem === 0) return false;
    if (packingBound(level, mask, buildable, rem, ice) > rem) return false; // can't be blocked in the walls left
    const key = chosen.slice().sort((a, b) => a - b).join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    for (const i of v5 ? branchLines(route, pool, mask, iceLines) : route.lines) {
      if (!buildable[i] || !take(i)) continue;
      mask[i] = 1;
      chosen.push(i);
      if (dfs(rem - 1)) return true;
      chosen.pop();
      mask[i] = 0;
      drop(i);
    }
    return false;
  }

  try {
    for (let k = opts.exactPar ?? 0; k <= limit; k++) {
      seen = new Set();
      if (dfs(k)) return { par: chosen.length, answer: toWalls(level, chosen) };
    }
  } catch (e) {
    if (e !== OUT_OF_WORK) throw e;
  }
  return null;
}

/**
 * Number of distinct k-wall sets (buildable lines only) that win, counting up to `cap`.
 * A set counts only if it leaves a route and that route is longer than the move limit.
 * Exact below the cap; returns `cap` when there are at least that many.
 * For k above par this includes sets that merely contain a smaller winning set (as long as they still leave a route).
 * `opts.maxNodes`: optional work budget (search states, like solve's); returns null when exceeded. Absent: unbounded, as before.
 */
// SPEC-QUESTION: the spec says "how many k-wall answers exist" without saying whether a
// k-wall set that contains a smaller winning set is an answer. Conservative choice: yes
// (any k-subset of buildable lines that wins). At k = par the two readings are identical.
export function countAnswers(level, k, cap = 50, opts = {}) {
  const maxNodes = opts.maxNodes ?? Infinity; // optional deterministic work budget (search states); null result when exceeded
  let nodes = 0;
  const OUT_OF_WORK = Symbol('out of work');
  const { buildable, pool: all, take, drop, monotone, ice, iceLines } = setup(level);
  const v5 = level.rules === 'v5';
  const mask = new Uint8Array(level.size * level.size * 2);
  const chosen = [];
  const found = new Set();
  const seen = new Set();
  if (!Number.isInteger(k) || k < 0 || k > all.length || cap <= 0) return 0;

  function addFound() {
    found.add(chosen.slice().sort((a, b) => a - b).join(','));
    return found.size >= cap;
  }

  // chosen already wins with fewer than k walls: every superset of size k also wins.
  // Extra walls can still cut every route, so each full set is re-checked (a set that is
  // still connected is still too long: walls never shorten a route).
  function fill(from, left, pool) {
    if (left === 0) {
      const r = routeWithMask(level, mask);
      // v4: still too long if still connected. v5: adding fences can shorten a route, so check it.
      return r !== null && (!v5 || isWin(level, r)) && addFound();
    }
    for (let i = from; i <= pool.length - left; i++) {
      if (++nodes > maxNodes) throw OUT_OF_WORK;
      if (!take(pool[i])) continue; // would break the v4 side cap: illegal
      chosen.push(pool[i]);
      mask[pool[i]] = 1;
      const stop = fill(i + 1, left - 1, pool);
      mask[pool[i]] = 0;
      chosen.pop();
      drop(pool[i]);
      if (stop) return true;
    }
    return false;
  }

  function dfs() {
    if (++nodes > maxNodes) throw OUT_OF_WORK;
    const route = routeWithMask(level, mask);
    if (monotone && deadCut(route)) return false; // dead end: cut off, and more walls can't reconnect
    if (route !== null && isWin(level, route)) {
      if (chosen.length === k) return addFound();
      if (v5) {
        const winKey = chosen.slice().sort((a, b) => a - b).join(',');
        if (seen.has(winKey)) return false;
        seen.add(winKey);
      }
      const pool = all.filter((i) => !mask[i]);
      return fill(0, k - chosen.length, pool);
    }
    if (chosen.length === k) return false;
    if (packingBound(level, mask, buildable, k - chosen.length, ice) > k - chosen.length) return false;
    const key = chosen.slice().sort((a, b) => a - b).join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    for (const i of v5 ? branchLines(route, all, mask, iceLines) : route.lines) {
      if (!buildable[i] || !take(i)) continue;
      mask[i] = 1;
      chosen.push(i);
      const stop = dfs();
      chosen.pop();
      mask[i] = 0;
      drop(i);
      if (stop) return true;
    }
    return false;
  }

  try {
    dfs();
  } catch (e) {
    if (e !== OUT_OF_WORK) throw e;
    return null;
  }
  return Math.min(found.size, cap);
}
