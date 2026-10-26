// Exact solver: par (fewest winning walls) and answer counting. Pure.
//
// A wall set wins only if it leaves the robot a route AND that route is longer than the move
// limit (rules v3.1: cutting every route is illegal). Key facts:
//  - A winning set must contain a buildable line the robot's current shortest route crosses
//    (otherwise that route survives and fits the limit; each move crosses one line, a
//    teleport jump crosses none). Branch only on those lines.
//  - Adding walls never shortens a route and never reconnects a cut, so a disconnected state
//    is a dead end: prune it. A connected state with a too-long route wins.
import { routeWithMask } from './path.js';
import { buildableLines, lineIndex, lineWall } from './level.js';

/** Wins only with a route left that is longer than the limit. A null route is illegal. */
function isWin(level, route) {
  return route !== null && route.positions.length - 1 > level.moveLimit;
}

function setup(level) {
  const buildable = new Uint8Array(level.size * level.size * 2);
  const pool = [];
  for (const [x, y, dir] of buildableLines(level)) {
    const i = lineIndex(level, x, y, dir);
    buildable[i] = 1;
    pool.push(i);
  }
  return { buildable, pool };
}

function toWalls(level, idxs) {
  return idxs.slice().sort((a, b) => a - b).map((i) => lineWall(level, i));
}

/**
 * @param {object} level parsed level
 * @param {{maxPar?: number}} [opts] give up (return null) beyond this many walls
 * @returns {{par:number, answer:number[][]} | null} answer is [x, y, "R"|"D"] walls; null if no wall set wins
 */
export function solve(level, opts = {}) {
  const { buildable, pool } = setup(level);
  const limit = Math.min(pool.length, opts.maxPar ?? Infinity);
  const mask = new Uint8Array(level.size * level.size * 2);
  const chosen = [];
  let seen;

  function dfs(rem) {
    const route = routeWithMask(level, mask);
    if (route === null) return false; // every route cut: illegal, and more walls can't undo it
    if (isWin(level, route)) return true;
    if (rem === 0) return false;
    const key = chosen.slice().sort((a, b) => a - b).join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    for (const i of route.lines) {
      if (!buildable[i]) continue;
      mask[i] = 1;
      chosen.push(i);
      if (dfs(rem - 1)) return true;
      chosen.pop();
      mask[i] = 0;
    }
    return false;
  }

  for (let k = 0; k <= limit; k++) {
    seen = new Set();
    if (dfs(k)) return { par: chosen.length, answer: toWalls(level, chosen) };
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
  const { buildable, pool: all } = setup(level);
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
      chosen.push(pool[i]);
      mask[pool[i]] = 1;
      const stop = fill(i + 1, left - 1, pool);
      mask[pool[i]] = 0;
      chosen.pop();
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
    const key = chosen.slice().sort((a, b) => a - b).join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    for (const i of route.lines) {
      if (!buildable[i]) continue;
      mask[i] = 1;
      chosen.push(i);
      const stop = dfs();
      chosen.pop();
      mask[i] = 0;
      if (stop) return true;
    }
    return false;
  }

  dfs();
  return Math.min(found.size, cap);
}
