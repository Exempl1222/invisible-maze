// Exact solver: par (fewest winning walls) and answer counting. Pure.
//
// Rules v4 adds a side cap (at most SIDE_CAP walls touching the start, same for the beacon). It is
// part of legality: a set over the cap is illegal and no superset fixes it (counts only grow),
// so the search treats it like a cut state and never branches into it.
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

/** Wins only with a route left that is longer than the limit. A null route is illegal. */
function isWin(level, route) {
  return route !== null && route.positions.length - 1 > level.moveLimit;
}

/**
 * Lower bound on extra walls needed from this state: the number of routes that fit the move limit
 * and share no buildable line (found greedily; a route's buildable lines are walled in a copy
 * before looking for the next). Every winning superset must put a wall on each of those routes,
 * and one wall can sit on only one of them, so at least this many more walls are needed.
 * Returns Infinity if a short route has no buildable line (nothing can ever block it). Stops
 * early once the count passes `rem`, since the state is then dead.
 */
function packingBound(level, mask, buildable, rem) {
  const tmp = mask.slice();
  let count = 0;
  for (;;) {
    const r = routeWithMask(level, tmp);
    if (r === null || r.positions.length - 1 > level.moveLimit) return count;
    let any = false;
    for (const i of r.lines) {
      if (buildable[i]) { tmp[i] = 1; any = true; }
    }
    if (!any) return Infinity;
    if (++count > rem) return count;
  }
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
  const capped = level.rules === 'v4';
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
  return { buildable, pool, take, drop };
}

function toWalls(level, idxs) {
  return idxs.slice().sort((a, b) => a - b).map((i) => lineWall(level, i));
}

/**
 * @param {object} level parsed level
 * @param {{maxPar?: number, maxNodes?: number}} [opts] give up (return null) beyond this many walls, or after
 *   exploring this many search states (a deterministic work budget for the offline generator; null then means "not found")
 * @returns {{par:number, answer:number[][]} | null} answer is [x, y, "R"|"D"] walls; null if no wall set wins
 */
export function solve(level, opts = {}) {
  const { buildable, pool, take, drop } = setup(level);
  const limit = Math.min(pool.length, opts.maxPar ?? Infinity);
  const mask = new Uint8Array(level.size * level.size * 2);
  const chosen = [];
  let seen;

  let nodes = 0;
  const maxNodes = opts.maxNodes ?? Infinity;
  const OUT_OF_WORK = Symbol('out of work');

  function dfs(rem) {
    if (++nodes > maxNodes) throw OUT_OF_WORK;
    const route = routeWithMask(level, mask);
    if (route === null) return false; // every route cut: illegal, and more walls can't undo it
    if (isWin(level, route)) return true;
    if (rem === 0) return false;
    if (packingBound(level, mask, buildable, rem) > rem) return false; // can't be blocked in the walls left
    const key = chosen.slice().sort((a, b) => a - b).join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    for (const i of route.lines) {
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
    for (let k = 0; k <= limit; k++) {
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
 */
// SPEC-QUESTION: the spec says "how many k-wall answers exist" without saying whether a
// k-wall set that contains a smaller winning set is an answer. Conservative choice: yes
// (any k-subset of buildable lines that wins). At k = par the two readings are identical.
export function countAnswers(level, k, cap = 50) {
  const { buildable, pool: all, take, drop } = setup(level);
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
    if (left === 0) return routeWithMask(level, mask) !== null && addFound();
    for (let i = from; i <= pool.length - left; i++) {
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
    const route = routeWithMask(level, mask);
    if (route === null) return false; // dead end: cut off, and more walls can't reconnect
    if (isWin(level, route)) {
      if (chosen.length === k) return addFound();
      const pool = all.filter((i) => !mask[i]);
      return fill(0, k - chosen.length, pool);
    }
    if (chosen.length === k) return false;
    if (packingBound(level, mask, buildable, k - chosen.length) > k - chosen.length) return false;
    const key = chosen.slice().sort((a, b) => a - b).join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    for (const i of route.lines) {
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

  dfs();
  return Math.min(found.size, cap);
}
