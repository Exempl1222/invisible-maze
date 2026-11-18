// Shortest route for the robot, honouring teleporters and walled lines. Pure.
//
// A "move" is one step up/right/down/left across the line between two tiles. If that line
// is walled the move is not allowed (both directions). Stepping onto a teleporter tile
// lands the robot on the partner tile, and that jump is the same single move. The move
// crosses only the line between the tile it left and the teleporter it stepped onto; the
// jump itself crosses no line, so no wall can stop it. The robot then stands on the
// partner (and may walk off it, or step onto the teleporter next to it).
// Tie-break (cosmetic): at each step prefer up, right, down, left among moves that stay
// on a shortest route. We get this by computing distance-to-beacon for every cell and
// stepping greedily in that order.
import { lineIndex, lineWall, GATE_DIR } from './level.js';

export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left

function isTeleporter(c) {
  return c >= 'a' && c <= 'z';
}

/** Line index crossed by a move from cell u (x, y) in direction d, going to cell v. */
function crossing(u, v, d) {
  // up: the "D" line of v; right: the "R" line of u; down: the "D" line of u; left: the "R" line of v
  return d === 0 ? v * 2 + 1 : d === 1 ? u * 2 : d === 2 ? u * 2 + 1 : v * 2;
}

/**
 * Route from level.start to level.beacon given walled lines.
 * `lineMask` is a Uint8Array of size * size * 2 indexed by lineIndex (1 = walled).
 * Returns { positions, teleports, via, lines } or null.
 *   positions: [x, y] the robot occupies, start..end (one entry per move, plus the start)
 *   teleports: indices i into positions where move i was a teleport jump
 *   via: via[i] = the teleporter tile stepped onto for move i, or null (via[0] is null)
 *   lines: lines[i] = lineIndex of the line crossed by move i + 1 (so lines.length = moves)
 */
export function routeWithMask(level, lineMask) {
  if (level.rules === 'v5') return routeV5(level, lineMask);
  const { size, grid, beacon, start } = level;
  const n = size * size;
  // land[idx*4 + d] = index where a move from idx in direction d ends, or -1
  const land = new Int32Array(n * 4).fill(-1);
  const rev = Array.from({ length: n }, () => []);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = grid[y][x];
      if (c === '#' || c === '~') continue;
      const u = y * size + x;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0];
        const ny = y + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const nc = grid[ny][nx];
        if (nc === '#' || nc === '~') continue;
        const v = ny * size + nx;
        if (lineMask[crossing(u, v, d)]) continue;
        let l = v;
        if (isTeleporter(nc)) {
          const p = level.partner(nx, ny);
          l = p[1] * size + p[0];
        }
        land[u * 4 + d] = l;
        rev[l].push(u);
      }
    }
  }
  const goal = beacon[1] * size + beacon[0];
  const dist = new Int32Array(n).fill(-1);
  dist[goal] = 0;
  const queue = [goal];
  for (let h = 0; h < queue.length; h++) {
    const v = queue[h];
    for (const u of rev[v]) {
      if (dist[u] === -1) {
        dist[u] = dist[v] + 1;
        queue.push(u);
      }
    }
  }
  const s = start[1] * size + start[0];
  if (dist[s] === -1) return null;

  const positions = [[start[0], start[1]]];
  const teleports = [];
  const via = [null];
  const lines = [];
  let cur = s;
  while (cur !== goal) {
    let next = -1;
    let d;
    for (d = 0; d < 4; d++) {
      const l = land[cur * 4 + d];
      if (l !== -1 && dist[l] === dist[cur] - 1) { next = l; break; }
    }
    const cx = cur % size;
    const cy = (cur - cx) / size;
    const sx = cx + DIRS[d][0];
    const sy = cy + DIRS[d][1];
    lines.push(crossing(cur, sy * size + sx, d));
    positions.push([next % size, Math.floor(next / size)]);
    if (isTeleporter(grid[sy][sx])) {
      teleports.push(positions.length - 1);
      via.push([sx, sy]);
    } else {
      via.push(null);
    }
    cur = next;
  }
  return { positions, teleports, via, lines };
}

// ---------------------------------------------------------------------------------------------
// Rules v5: ice, mud and gates. A "move" is still one go in one direction, but now
//  - a move onto ice slides on while he stands on ice and the next tile can be entered; the whole
//    slide is one move and crosses every line between the tiles it passes;
//  - a move that ends on mud costs 2 (the step in, then one stuck move where he stays put);
//  - a gate can only be entered and left moving along its arrow;
//  - a teleporter ends a slide (and jumps him), mud ends it, so does anything that is not ice.
// So the moves form a directed graph with costs 1 or 2 and the cheapest route is a shortest path.
// The tie-break (up, right, down, left) is the same cosmetic one: greedy on distance-to-beacon.
// Adding a fence can now SHORTEN a route or reconnect a cut one (it can stop a slide on a tile
// with a way on), so v5 routes are not monotone in the fence set. solve.js accounts for that.
//
// v5 result: { positions, teleports, via, lines, trails, stuck } where positions has one entry
// per move (the stuck move repeats the mud tile), so positions.length - 1 is the cost in moves.
// `lines` is the flat list of every line the route crosses (a slide crosses several), not one per
// move. trails[i] (aligned with positions) lists the tiles passed during move i, ending with the
// tile he stepped or slid onto (the teleporter tile for a jump, before he lands on the partner);
// it is [] for move 0 and for a stuck move. stuck lists the indices of the stuck moves.

function isTeleporterV5(c) {
  return c >= 'a' && c <= 'z' && c !== 'v'; // 'v' is the down gate in v5
}

/**
 * Can he step from (x, y) in direction d? Returns the target cell index, or -1.
 * `tool` (v5 gnome tools, only for the first step of a move) changes what the step may do:
 * "ladder": the line MUST be fenced and the fence is ignored; "pickaxe": the target must be rock;
 * "plank": the target must be river. Without it rock and river are never entered.
 */
function stepTarget(grid, size, mask, x, y, d, tool) {
  const nx = x + DIRS[d][0];
  const ny = y + DIRS[d][1];
  if (nx < 0 || ny < 0 || nx >= size || ny >= size) return -1;
  const nc = grid[ny][nx];
  if (tool === 'pickaxe') {
    if (nc !== '#') return -1;
  } else if (tool === 'plank') {
    if (nc !== '~') return -1;
  } else if (nc === '#' || nc === '~') return -1;
  const u = y * size + x;
  const v = ny * size + nx;
  const fenced = mask[crossing(u, v, d)] === 1;
  if (tool === 'ladder' ? !fenced : fenced) return -1;
  const leave = GATE_DIR.get(grid[y][x]);
  if (leave !== undefined && leave !== d) return -1;
  const enter = GATE_DIR.get(nc);
  if (enter !== undefined && enter !== d) return -1;
  return v;
}

/**
 * The whole move from cell u in direction d, or null if he can't take it:
 * { end, cost, tiles, lines, via, mud }. tiles: the cell indices he passes, ending with the tile he
 * stepped or slid onto (for a teleporter, the teleporter tile, before the jump). end: where he stands.
 * `tool` (gnome tool, first step only): see stepTarget. A ladder or pickaxe step costs one more
 * than the same move without it; a plank step costs 1 (river is not ice, mud or a teleporter).
 */
function moveV5(level, mask, u, d, tool) {
  const { size, grid } = level;
  const x = u % size;
  const y = (u - x) / size;
  let cur = stepTarget(grid, size, mask, x, y, d, tool);
  if (cur === -1) return null;
  const tiles = [cur];
  const lines = [crossing(u, cur, d)];
  let c = grid[Math.floor(cur / size)][cur % size];
  if (tool === 'pickaxe') c = '.'; // the rock is grass once dug
  const extra = tool === 'ladder' || tool === 'pickaxe' ? 1 : 0;
  while (c === '*') {
    const cx = cur % size;
    const cy = (cur - cx) / size;
    const nxt = stepTarget(grid, size, mask, cx, cy, d);
    if (nxt === -1) break;
    lines.push(crossing(cur, nxt, d));
    tiles.push(nxt);
    cur = nxt;
    c = grid[Math.floor(cur / size)][cur % size];
  }
  if (isTeleporterV5(c)) {
    const p = level.partner(cur % size, Math.floor(cur / size));
    return { end: p[1] * size + p[0], cost: 1 + extra, tiles, lines, via: cur, mud: false };
  }
  return { end: cur, cost: (c === '&' ? 2 : 1) + extra, tiles, lines, via: -1, mud: c === '&' };
}

function routeV5(level, lineMask) {
  const { size, grid, beacon, start } = level;
  const n = size * size;
  const goal = beacon[1] * size + beacon[0];
  const s = start[1] * size + start[0];
  const edge = new Array(n * 4).fill(null);
  const rev = Array.from({ length: n }, () => []);
  for (let u = 0; u < n; u++) {
    const c = grid[Math.floor(u / size)][u % size];
    if (c === '#' || c === '~' || u === goal) continue;
    for (let d = 0; d < 4; d++) {
      const m = moveV5(level, lineMask, u, d);
      if (m === null) continue;
      edge[u * 4 + d] = m;
      rev[m.end].push([u, m.cost]);
    }
  }
  // Dijkstra from the beacon over reversed edges; costs are 1 or 2, so distance buckets do it.
  const dist = new Int32Array(n).fill(-1);
  const buckets = [[goal]];
  dist[goal] = 0;
  for (let k = 0; k < buckets.length; k++) {
    for (const v of buckets[k] ?? []) {
      if (dist[v] !== k) continue; // stale entry
      for (const [u, w] of rev[v]) {
        if (dist[u] === -1 || dist[u] > k + w) {
          dist[u] = k + w;
          (buckets[k + w] ??= []).push(u);
        }
      }
    }
  }
  if (level.tool !== null) {
    const t = routeV5Tool(level, lineMask, dist[s]);
    if (t !== null) return t;
  }
  if (dist[s] === -1) return null;

  const positions = [[start[0], start[1]]];
  const teleports = [];
  const via = [null];
  const lines = [];
  const trails = [[]];
  const stuck = [];
  let cur = s;
  while (cur !== goal) {
    let m = null;
    for (let d = 0; d < 4; d++) {
      const e = edge[cur * 4 + d];
      if (e !== null && dist[e.end] !== -1 && dist[e.end] + e.cost === dist[cur]) { m = e; break; }
    }
    for (const l of m.lines) lines.push(l);
    positions.push([m.end % size, Math.floor(m.end / size)]);
    trails.push(m.tiles.map((t) => [t % size, Math.floor(t / size)]));
    if (m.via !== -1) {
      teleports.push(positions.length - 1);
      via.push([m.via % size, Math.floor(m.via / size)]);
    } else {
      via.push(null);
    }
    if (m.mud) {
      positions.push(positions[positions.length - 1].slice()); // the stuck move: he stays on the mud
      trails.push([]);
      via.push(null);
      stuck.push(positions.length - 1);
    }
    cur = m.end;
  }
  const route = { positions, teleports, via, lines, trails, stuck };
  if (level.tool !== null) Object.assign(route, { toolStep: null, toolUse: null, toolFreeRoute: true });
  return route;
}

// ---------------------------------------------------------------------------------------------
// Gnome tools (v5, "tool": "ladder" | "pickaxe" | "plank"). He uses his tool at most once, and only
// where it makes his route cheaper; on a tie he does not use it. So the cheapest route is a shortest
// path in a state graph with a "tool used?" bit:
//  - layer 0: tool still unused. Normal moves stay in layer 0. The tool move (first step of a move,
//    never mid-slide) goes to layer 1, or for the plank onto the river tile (layer 2).
//  - layer 1: tool used. Only normal moves. For the pickaxe the dug rock is grass from then on, for
//    slides too, so routeV5Tool runs the graph once per diggable rock (review of 8g, C1).
//  - layer 2 (plank): standing on the river tile; the only moves are normal ones to land (a normal
//    move never targets river, so he never goes on to another river tile), into layer 1.
// Costs: ladder and pickaxe step 2 (+1 for mud after it), plank step 1. A ladder or pickaxe step is
// shown as two moves: a "prep" move where he stays put, then the crossing (like mud's stuck move).
// The no-cut rule ignores the tool, so the result says whether a tool-free route exists.
//
// Result: the v5 route plus toolStep (index into positions of the move that arrives across the
// fence / onto the rock / onto the river; null if the tool is not used), toolUse (null, or
// { tool, prep, line | tile, from, to }: prep = index of the prep move or null for the plank; line =
// the climbed line as a wall [x, y, "R"|"D"] (ladder); tile = the rock or river tile [x, y];
// from = where he stood; to = the tile he stepped onto) and toolFreeRoute (a route without the
// tool exists). The ladder's line is also in `lines`.

/** Cheapest tool route if it is strictly cheaper than the tool-free one (`freeDist`, -1 if none), else null. */
function routeV5Tool(level, mask, freeDist) {
  if (level.tool !== 'pickaxe') return routeV5ToolOnce(level, mask, freeDist, -1);
  // Pickaxe: after the dig, that rock is grass for every later move, slides included, so the layer-1
  // graph depends on which rock was dug. Try each rock with an open neighbour; keep the cheapest
  // (ties: the first in reading order, cosmetic).
  const { size, grid } = level;
  let best = null;
  for (let r = 0; r < size * size; r++) {
    const x = r % size;
    const y = (r - x) / size;
    if (grid[y][x] !== '#') continue;
    const open = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]].some(([a, b]) => a >= 0 && b >= 0 && a < size && b < size && grid[b][a] !== '#' && grid[b][a] !== '~');
    if (!open) continue;
    const t = routeV5ToolOnce(level, mask, freeDist, r);
    if (t !== null && (best === null || t.positions.length < best.positions.length)) best = t;
  }
  return best;
}

/** One pass of the tool graph. `dug`: for the pickaxe, the only rock he may dig (grass in layer 1); else -1. */
function routeV5ToolOnce(level, mask, freeDist, dug) {
  const { size, grid, beacon, start, tool } = level;
  // Layer 1 sees the dug rock as grass.
  const after = dug === -1 ? level : Object.assign(Object.create(level), {
    grid: grid.map((row, y) => row.map((c, x) => (y * size + x === dug ? '.' : c))),
  });
  const n = size * size;
  const goal = beacon[1] * size + beacon[0];
  const s = start[1] * size + start[0];
  const adj = new Array(n * 3 * 4).fill(null); // node * 4 + d
  const rev = Array.from({ length: n * 3 }, () => []);
  const add = (from, d, to, m) => {
    adj[from * 4 + d] = { to, m };
    rev[to].push([from, m.cost]);
  };
  for (let u = 0; u < n; u++) {
    if (u === goal) continue;
    const c = grid[Math.floor(u / size)][u % size];
    const land = c !== '#' && c !== '~';
    for (let d = 0; d < 4; d++) {
      const m = moveV5(level, mask, u, d);
      if (m !== null) {
        if (land) add(u, d, m.end, m);
        if (c === '~' && tool === 'plank') add(2 * n + u, d, n + m.end, m);
      }
      const m1 = dug === -1 ? m : moveV5(after, mask, u, d);
      if (m1 !== null && (land || u === dug)) add(n + u, d, n + m1.end, m1);
      if (land) {
        const t = moveV5(level, mask, u, d, tool);
        if (t !== null && (dug === -1 || t.tiles[0] === dug)) add(u, d, (tool === 'plank' ? 2 * n : n) + t.end, t);
      }
    }
  }
  const dist = new Int32Array(n * 3).fill(-1);
  dist[goal] = 0;
  dist[n + goal] = 0;
  const buckets = [[goal, n + goal]];
  for (let k = 0; k < buckets.length; k++) {
    for (const v of buckets[k] ?? []) {
      if (dist[v] !== k) continue;
      for (const [u, w] of rev[v]) {
        if (dist[u] === -1 || dist[u] > k + w) {
          dist[u] = k + w;
          (buckets[k + w] ??= []).push(u);
        }
      }
    }
  }
  const best = dist[s];
  if (best === -1 || (freeDist !== -1 && best >= freeDist)) return null;

  const positions = [[start[0], start[1]]];
  const teleports = [];
  const via = [null];
  const lines = [];
  const trails = [[]];
  const stuck = [];
  let toolStep = null;
  let toolUse = null;
  const xy = (i) => [i % size, Math.floor(i / size)];
  let node = s;
  while (node % n !== goal || node >= 2 * n) {
    let e = null;
    let d;
    for (d = 0; d < 4; d++) {
      const a = adj[node * 4 + d];
      if (a !== null && dist[a.to] !== -1 && dist[a.to] + a.m.cost === dist[node]) { e = a; break; }
    }
    const m = e.m;
    const cell = node % n;
    const isTool = (node < n && e.to >= n); // the move that spends the tool
    let prep = null;
    if (isTool && tool !== 'plank') {
      positions.push(xy(cell)); // the prep move: he stays put
      trails.push([]);
      via.push(null);
      prep = positions.length - 1;
    }
    for (const l of m.lines) lines.push(l);
    positions.push(xy(m.end));
    trails.push(m.tiles.map(xy));
    if (m.via !== -1) {
      teleports.push(positions.length - 1);
      via.push(xy(m.via));
    } else {
      via.push(null);
    }
    if (isTool) {
      toolStep = positions.length - 1;
      toolUse = tool === 'ladder'
        ? { tool, prep, line: lineWall(level, m.lines[0]), from: xy(cell), to: xy(m.tiles[0]) }
        : { tool, prep, tile: xy(m.tiles[0]), from: xy(cell), to: xy(m.tiles[0]) };
    }
    if (m.mud) {
      positions.push(positions[positions.length - 1].slice());
      trails.push([]);
      via.push(null);
      stuck.push(positions.length - 1);
    }
    node = e.to;
  }
  return { positions, teleports, via, lines, trails, stuck, toolStep, toolUse, toolFreeRoute: freeDist !== -1 };
}

/** Line mask for walls [x, y, "R" | "D"]. Throws on malformed or out-of-grid walls. */
export function wallMask(level, walls) {
  const mask = new Uint8Array(level.size * level.size * 2);
  for (const w of walls) {
    if (!Array.isArray(w) || w.length !== 3 || !level.inBounds(w[0], w[1]) || (w[2] !== 'R' && w[2] !== 'D')) {
      throw new Error(`wall must be [x, y, "R" or "D"] inside the grid, got ${JSON.stringify(w)}`);
    }
    mask[lineIndex(level, w[0], w[1], w[2])] = 1;
  }
  return mask;
}

/**
 * Convenience wrapper: walls is an array of [x, y, "R" | "D"]. The routing respects every
 * wall passed in (even on lines the guard rule would forbid); validation is simulate's job.
 */
export function findPath(level, walls = []) {
  return routeWithMask(level, wallMask(level, walls));
}
