// Gnome tools (rules v5) exactness: solve() and countAnswers() against an independent brute force.
// The oracle enumerates every subset of lines and prices each with its own search over full states
// (position, mud-stuck, tool prep, on the plank, tool used, which rock was dug), one move per layer.
// It never calls findPath, buildableLines, simulate, solve or routeV5, and it keeps the dug rock in the
// state instead of relying on "a shortest route never revisits it".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from './level.js';
import { solve, countAnswers } from './solve.js';
import { simulate } from './simulate.js';
import { createRng } from './rng.js';

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
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function fenced(walls, x1, y1, x2, y2) {
  const key = x2 > x1 ? `${x1},${y1},R` : x2 < x1 ? `${x2},${y2},R` : y2 > y1 ? `${x1},${y1},D` : `${x2},${y2},D`;
  return walls.has(key);
}

/**
 * One move from (x, y) going (dx, dy). kind: 'n' normal, 'l' ladder (first step must cross a fence, which
 * is ignored), 'p' pickaxe (first step must enter rock), 'w' plank (first step must enter river).
 * `open` = index of the dug rock tile (now grass), or -1. Returns null or { x, y, mud, river, dug }.
 */
function oneMove(b, walls, x, y, dx, dy, kind, open) {
  const at = (cx, cy) => (cy * b.n + cx === open ? '.' : b.rows[cy][cx]);
  let cx = x;
  let cy = y;
  let first = true;
  for (;;) {
    const nx = cx + dx;
    const ny = cy + dy;
    const inside = nx >= 0 && ny >= 0 && nx < b.n && ny < b.n;
    const target = inside ? at(nx, ny) : '#';
    const here = at(cx, cy);
    const k = first ? kind : 'n';
    let blocked = !inside
      || (ARROW[here] && (ARROW[here][0] !== dx || ARROW[here][1] !== dy))
      || (ARROW[target] && (ARROW[target][0] !== dx || ARROW[target][1] !== dy));
    if (!blocked) {
      const f = fenced(walls, cx, cy, nx, ny);
      if (k === 'n') blocked = target === '#' || target === '~' || f;
      else if (k === 'l') blocked = target === '#' || target === '~' || !f;
      else if (k === 'p') blocked = target !== '#' || f;
      else blocked = target !== '~' || f;
    }
    if (blocked) return first ? null : { x: cx, y: cy, mud: false, river: false, dug: -1 };
    const dug = first && kind === 'p' ? ny * b.n + nx : -1;
    first = false;
    cx = nx;
    cy = ny;
    const t = dug !== -1 ? '.' : at(cx, cy);
    if (t >= 'a' && t <= 'z' && t !== 'v') {
      const [p, q] = b.tele[t];
      const other = p[0] === cx && p[1] === cy ? q : p;
      return { x: other[0], y: other[1], mud: false, river: false, dug };
    }
    if (t === '&') return { x: cx, y: cy, mud: true, river: false, dug };
    if (t === '~') return { x: cx, y: cy, mud: false, river: true, dug };
    if (t !== '*') return { x: cx, y: cy, mud: false, river: false, dug };
  }
}

/** Fewest moves with these fences and (tool, or null for none), or null if he can't get home. */
function oracleCost(b, walls, tool) {
  const kindOf = { ladder: 'l', pickaxe: 'p', plank: 'w' };
  let layer = new Set([`${b.start[0]},${b.start[1]},N,0,-1`]);
  const everSeen = new Set(layer);
  const isGoal = (x, y) => x === b.goal[0] && y === b.goal[1];
  for (let m = 1; m <= b.n * b.n * 6 && layer.size; m++) {
    const next = new Set();
    const arrive = (r, used, open) => {
      if (isGoal(r.x, r.y)) return true;
      const o = r.dug !== -1 ? r.dug : open;
      next.add(`${r.x},${r.y},${r.mud ? 'M' : r.river ? 'W' : 'N'},${used},${o}`);
      return false;
    };
    for (const s of layer) {
      const [xs, ys, mode, usedS, openS] = s.split(',');
      const x = Number(xs);
      const y = Number(ys);
      const used = Number(usedS);
      const open = Number(openS);
      if (mode === 'M') { next.add(`${x},${y},N,${used},${open}`); continue; }
      if (mode[0] === 'P') { // the prep move is over: cross now
        const [dx, dy] = DIRS[Number(mode[1])];
        const r = oneMove(b, walls, x, y, dx, dy, kindOf[tool], open);
        if (r && arrive(r, used, open)) return m;
        continue;
      }
      for (let d = 0; d < 4; d++) {
        const [dx, dy] = DIRS[d];
        const r = oneMove(b, walls, x, y, dx, dy, 'n', open);
        if (r && arrive(r, used, open)) return m;
        if (mode === 'W' || used || tool === null) continue;
        if (tool === 'plank') {
          const w = oneMove(b, walls, x, y, dx, dy, 'w', open);
          if (w) next.add(`${w.x},${w.y},W,1,${open}`);
        } else if (oneMove(b, walls, x, y, dx, dy, kindOf[tool], open)) {
          next.add(`${x},${y},P${d},1,${open}`); // prep: stays put for one move
        }
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

function sidesTouching(set, [px, py]) {
  let c = 0;
  for (const [x, y, d] of set) {
    const [x2, y2] = d === 'R' ? [x + 1, y] : [x, y + 1];
    if ((x === px && y === py) || (x2 === px && y2 === py)) c++;
  }
  return c;
}

/** counts[k] = legal winning k-sets: cap on sides, a tool-free route left (no-cut ignores the tool), tool route > limit. */
function oracleCounts(b, limit, maxK, tool) {
  const lines = oracleLines(b);
  const counts = new Array(maxK + 1).fill(0);
  const pick = [];
  function rec(from, k) {
    if (pick.length === k) {
      if (sidesTouching(pick, b.start) > 2 || sidesTouching(pick, b.goal) > 2) return;
      const set = new Set(pick.map((w) => w.join(',')));
      if (oracleCost(b, set, null) === null) return; // illegal: cuts every tool-free route
      const cost = oracleCost(b, set, tool);
      if (cost > limit) counts[k]++;
      return;
    }
    for (let i = from; i < lines.length; i++) {
      pick.push(lines[i]);
      rec(i + 1, k);
      pick.pop();
    }
  }
  for (let k = 0; k <= maxK; k++) rec(0, k);
  return counts;
}

function randomBoard(rng, n, withTeleport, noIce = false) {
  const cells = [];
  for (let i = 0; i < n * n; i++) {
    const r = rng.next();
    cells.push(r < 0.38 ? '.' : r < 0.50 ? '*' : r < 0.58 ? '&' : r < 0.70 ? '#' : r < 0.82 ? '~'
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

function run(tool, seedBase, count, n, maxK, compareNoTool, noIce = false) {
  const rng = createRng(seedBase);
  let boards = 0;
  let withPar = 0;
  let toolMatters = 0;
  let freeCut = 0;
  while (boards < count) {
    const rows = randomBoard(rng, n, rng.chance(0.3), noIce);
    const b = makeBoard(rows);
    const base = oracleCost(b, new Set(), tool);
    if (base === null || base < 2) continue;
    const moveLimit = base + rng.int(0, 2);
    let level;
    try {
      level = parseLevel({ id: 'bf', size: n, tiles: rows, moveLimit, wallBudget: maxK, rules: 'v5', tool });
    } catch (e) {
      if (/gate/.test(e.message)) continue;
      throw e;
    }
    boards++;
    if (oracleCost(b, new Set(), null) === null) freeCut++;

    const counts = oracleCounts(b, moveLimit, maxK, tool);
    const par = counts.findIndex((c) => c > 0);
    const where = `${tool} board ${boards} ${JSON.stringify(rows)} limit ${moveLimit}`;
    if (compareNoTool) {
      const plain = oracleCounts(b, moveLimit, maxK, null);
      if (plain.some((c, k) => c !== counts[k])) toolMatters++;
    }

    const s = solve(level, { maxPar: maxK });
    if (par === -1) {
      assert.equal(s, null, `${where}: oracle finds no win up to ${maxK} walls`);
    } else {
      withPar++;
      assert.ok(s, `${where}: oracle par ${par}`);
      assert.equal(s.par, par, `${where}: par`);
      const set = new Set(s.answer.map((w) => w.join(',')));
      assert.ok(oracleCost(b, set, null) !== null && oracleCost(b, set, tool) > moveLimit, `${where}: answer ${JSON.stringify(s.answer)} must win`);
      assert.equal(simulate(level, s.answer).result, 'win', `${where}: simulate on the answer`);
    }
    const top = par === -1 ? maxK : Math.min(maxK, par + 1);
    for (let k = 0; k <= top; k++) {
      assert.equal(countAnswers(level, k, 1e6), counts[k], `${where}: countAnswers(${k})`);
    }
  }
  return { boards, withPar, toolMatters, freeCut };
}

for (const [tool, seed] of [['ladder', 100], ['pickaxe', 200], ['plank', 300]]) {
  test(`${tool}: solve and countAnswers match brute force on 4x4 boards`, () => {
    const r = run(tool, 9000 + seed, 100, 4, 4, true);
    assert.ok(r.withPar >= 25, `only ${r.withPar} boards had a winning set`);
    assert.ok(r.toolMatters >= 5, `the ${tool} changed the oracle's counts on only ${r.toolMatters} boards`);
  });
  test(`${tool}: solve and countAnswers match brute force on 5x5 boards`, () => {
    const r = run(tool, 12000 + seed, 30, 5, 3, false);
    assert.ok(r.withPar >= 6, `only ${r.withPar} boards had a winning set`);
  });
}

// Ice-free boards take the monotone path in solve.js (cut-state prune and packing bound on).
for (const [tool, seed] of [['ladder', 400], ['pickaxe', 500], ['plank', 600]]) {
  test(`${tool}: solve and countAnswers match brute force on ice-free 4x4 boards (pruned path)`, () => {
    const r = run(tool, 9000 + seed, 100, 4, 4, true, true);
    assert.ok(r.withPar >= 25, `only ${r.withPar} boards had a winning set`);
  });
}
