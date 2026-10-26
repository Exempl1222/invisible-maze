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
import { lineIndex } from './level.js';

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
