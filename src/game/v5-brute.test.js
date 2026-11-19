// Rules v5 exactness: solve() and countAnswers() against an independent brute force.
// The oracle below enumerates every subset of lines and routes with its own deliberately simple
// search (a layered breadth-first search over "after n moves he may be here"). It never calls
// findPath, buildableLines, simulate or solve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from './level.js';
import { solve, countAnswers } from './solve.js';
import { simulate } from './simulate.js';
import { createRng } from './rng.js';

// ------------------------------------------------------------ the oracle

function makeBoard(rows) {
  const n = rows.length;
  let start = null;
  let goal = null;
  const tele = {};
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === 'R') start = [x, y];
    if (c === 'B') goal = [x, y];
    if (c >= 'a' && c <= 'z' && c !== 'v') (tele[c] ??= []).push([x, y]);
  }));
  return { n, rows, start, goal, tele };
}

const ARROW = { '>': [1, 0], '<': [-1, 0], '^': [0, -1], v: [0, 1] };

/** Is the line between orthogonal neighbours (x1,y1) and (x2,y2) fenced? walls: Set of "x,y,R|D". */
function fenced(walls, x1, y1, x2, y2) {
  const key = x2 > x1 ? `${x1},${y1},R` : x2 < x1 ? `${x2},${y2},R` : y2 > y1 ? `${x1},${y1},D` : `${x2},${y2},D`;
  return walls.has(key);
}

/** One move from (x, y) going (dx, dy), written out tile by tile. Returns null or { x, y, mud }. */
function oneMove(b, walls, x, y, dx, dy) {
  let cx = x;
  let cy = y;
  let first = true;
  for (;;) {
    const nx = cx + dx;
    const ny = cy + dy;
    const inside = nx >= 0 && ny >= 0 && nx < b.n && ny < b.n;
    const target = inside ? b.rows[ny][nx] : '#';
    const here = b.rows[cy][cx];
    const blocked = !inside || target === '#' || target === '~' || fenced(walls, cx, cy, nx, ny)
      || (ARROW[here] && (ARROW[here][0] !== dx || ARROW[here][1] !== dy))
      || (ARROW[target] && (ARROW[target][0] !== dx || ARROW[target][1] !== dy));
    if (blocked) return first ? null : { x: cx, y: cy, mud: false };
    first = false;
    cx = nx;
    cy = ny;
    const t = b.rows[cy][cx];
    if (t >= 'a' && t <= 'z' && t !== 'v') {
      const [p, q] = b.tele[t];
      const other = p[0] === cx && p[1] === cy ? q : p;
      return { x: other[0], y: other[1], mud: false };
    }
    if (t === '&') return { x: cx, y: cy, mud: true };
    if (t !== '*') return { x: cx, y: cy, mud: false };
  }
}

/** Fewest moves to the house with these fences, or null. Layered: states reachable after exactly m moves. */
function oracleCost(b, walls) {
  let layer = new Set([`${b.start[0]},${b.start[1]},0`]);
  const everSeen = new Set(layer);
  for (let m = 1; m <= b.n * b.n * 3 && layer.size; m++) {
    const next = new Set();
    for (const s of layer) {
      const [x, y, stuck] = s.split(',').map(Number);
      if (stuck) {
        next.add(`${x},${y},0`); // the stuck move: he stays on the tile
        continue;
      }
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const r = oneMove(b, walls, x, y, dx, dy);
        if (!r) continue;
        if (r.x === b.goal[0] && r.y === b.goal[1]) return m;
        next.add(`${r.x},${r.y},${r.mud ? 1 : 0}`);
      }
    }
    layer = new Set([...next].filter((k) => !everSeen.has(k)));
    layer.forEach((k) => everSeen.add(k));
  }
  return null;
}

const walkableChar = (c) => c !== '#' && c !== '~';

function oracleLines(b) {
  const lines = [];
  for (let y = 0; y < b.n; y++) {
    for (let x = 0; x < b.n; x++) {
      if (x + 1 < b.n && walkableChar(b.rows[y][x]) && walkableChar(b.rows[y][x + 1])) lines.push([x, y, 'R']);
      if (y + 1 < b.n && walkableChar(b.rows[y][x]) && walkableChar(b.rows[y + 1][x])) lines.push([x, y, 'D']);
    }
  }
  return lines;
}

function sidesTouching(b, set, [px, py]) {
  let c = 0;
  for (const [x, y, d] of set) {
    const [x2, y2] = d === 'R' ? [x + 1, y] : [x, y + 1];
    if ((x === px && y === py) || (x2 === px && y2 === py)) c++;
  }
  return c;
}

/** counts[k] = number of legal winning k-sets (cap <= 2 on each of start and house, route left, route > limit), plus first example. */
function oracleCounts(b, limit, maxK) {
  const lines = oracleLines(b);
  const counts = new Array(maxK + 1).fill(0);
  const example = new Array(maxK + 1).fill(null);
  const pick = [];
  function rec(from, k) {
    if (pick.length === k) {
      if (sidesTouching(b, pick, b.start) > 2 || sidesTouching(b, pick, b.goal) > 2) return;
      const cost = oracleCost(b, new Set(pick.map((w) => w.join(','))));
      if (cost !== null && cost > limit) {
        counts[k]++;
        example[k] ??= pick.map((w) => w.slice());
      }
      return;
    }
    for (let i = from; i < lines.length; i++) {
      pick.push(lines[i]);
      rec(i + 1, k);
      pick.pop();
    }
  }
  for (let k = 0; k <= maxK; k++) rec(0, k);
  return { counts, example };
}

// ------------------------------------------------------------ board generator

function randomBoard(rng, n, withTeleport, noIce = false) {
  const cells = [];
  for (let i = 0; i < n * n; i++) {
    const r = rng.next();
    cells.push(r < 0.40 ? '.' : r < 0.60 ? '*' : r < 0.70 ? '&' : r < 0.78 ? '#' : r < 0.82 ? '~'
      : '><^v'[Math.floor(rng.next() * 4)]);
  }
  const order = rng.shuffle([...Array(n * n).keys()]);
  cells[order[0]] = 'R';
  cells[order[1]] = 'B';
  if (withTeleport) {
    cells[order[2]] = 'a';
    cells[order[3]] = 'a';
  }
  const rows = [];
  for (let y = 0; y < n; y++) rows.push(cells.slice(y * n, y * n + n).join('').replace(/\*/g, noIce ? '.' : '*'));
  return rows;
}

// ------------------------------------------------------------ the test

function run(seedBase, count, n, maxK, noIce = false) {
  const rng = createRng(seedBase);
  let boards = 0;
  let withPar = 0;
  while (boards < count) {
    const rows = randomBoard(rng, n, rng.chance(0.3), noIce);
    const b = makeBoard(rows);
    const base = oracleCost(b, new Set());
    if (base === null || base < 2) continue; // need a route, and something worth blocking
    const moveLimit = base + rng.int(0, 2);
    let level;
    try {
      level = parseLevel({ id: 'bf', size: n, tiles: rows, moveLimit, wallBudget: maxK, rules: 'v5' });
    } catch (e) {
      if (/gate/.test(e.message)) continue; // gate with a bad entry or exit: not a legal board
      throw e;
    }
    boards++;

    const { counts, example } = oracleCounts(b, moveLimit, maxK);
    const par = counts.findIndex((c) => c > 0);
    const where = `board ${boards} ${JSON.stringify(rows)} limit ${moveLimit}`;

    const s = solve(level, { maxPar: maxK });
    if (par === -1) {
      assert.equal(s, null, `${where}: oracle finds no win up to ${maxK} walls`);
    } else {
      withPar++;
      assert.ok(s, `${where}: oracle par ${par}`);
      assert.equal(s.par, par, `${where}: par`);
      assert.equal(s.answer.length, par);
      // the answer is a real winning set according to the oracle
      const cost = oracleCost(b, new Set(s.answer.map((w) => w.join(','))));
      assert.ok(cost !== null && cost > moveLimit, `${where}: answer ${JSON.stringify(s.answer)} must win`);
      // and simulate (which uses the engine's own route) agrees it wins
      const bigBudget = parseLevel({ id: 'bf', size: n, tiles: rows, moveLimit, wallBudget: maxK, rules: 'v5' });
      assert.equal(simulate(bigBudget, s.answer).result, 'win', `${where}: simulate on the answer`);
      assert.ok(example[par]);
    }
    const top = par === -1 ? maxK : Math.min(maxK, par + 1);
    for (let k = 0; k <= top; k++) {
      assert.equal(countAnswers(level, k, 1e6), counts[k], `${where}: countAnswers(${k})`);
    }
  }
  return { boards, withPar };
}

test('v5 solve and countAnswers match brute force on 4x4 boards (ice, mud, gates, teleporters)', () => {
  const r = run(5001, 220, 4, 4);
  assert.equal(r.boards, 220);
  assert.ok(r.withPar >= 40, `only ${r.withPar} boards had a winning set; the generator is too tame`);
});

test('v5 solve and countAnswers match brute force on 5x5 boards (ice, mud, gates, teleporters)', () => {
  const r = run(7001, 100, 5, 3);
  assert.equal(r.boards, 100);
  assert.ok(r.withPar >= 15, `only ${r.withPar} boards had a winning set; the generator is too tame`);
});

test('v5 solve and countAnswers match brute force on ice-free 4x4 boards (pruned path: mud, gates, teleporters)', () => {
  const r = run(5501, 220, 4, 4, true);
  assert.equal(r.boards, 220);
  assert.ok(r.withPar >= 40, `only ${r.withPar} boards had a winning set; the generator is too tame`);
});
