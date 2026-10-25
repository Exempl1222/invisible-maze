// Exact solver: par (fewest winning walls) and answer counting. Pure.
//
// Key fact: a route that fits the move limit and is left unblocked keeps the robot
// alive, so every winning wall set must contain a buildable line the robot's current
// shortest route crosses (each move crosses one line; a teleport jump crosses none).
// Branch only on those lines. Adding walls never shortens a route, so winning is
// monotone (any superset of a winning set also wins).
import { routeWithMask } from './path.js';
import { buildableLines, lineIndex, lineWall } from './level.js';

function isWin(level, route) {
  return route === null || route.positions.length - 1 > level.moveLimit;
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
 * Exact below the cap; returns `cap` when there are at least that many.
 * For k above par this includes sets that merely contain a smaller winning set.
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
  function fill(from, left, pool) {
    if (left === 0) return addFound();
    for (let i = from; i <= pool.length - left; i++) {
      chosen.push(pool[i]);
      const stop = fill(i + 1, left - 1, pool);
      chosen.pop();
      if (stop) return true;
    }
    return false;
  }

  function dfs() {
    const route = routeWithMask(level, mask);
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
