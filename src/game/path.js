// Shortest route for the robot, honouring teleporters. Pure.
//
// A "move" is one step up/right/down/left. Stepping onto a teleporter tile lands the
// robot on the partner tile, and that jump is the same single move. The robot therefore
// never stays on the teleporter tile it stepped onto; it stands on the partner (and may
// then walk off it, or step onto the teleporter next to it).
// Tie-break (cosmetic): at each step prefer up, right, down, left among moves that stay
// on a shortest route. We get this by computing distance-to-beacon for every cell and
// stepping greedily in that order.

export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left

function isTeleporter(c) {
  return c >= 'a' && c <= 'z';
}

/**
 * Route from level.start to level.beacon given blocked cells.
 * `blocked` is a Uint8Array indexed y * size + x (1 = player wall).
 * Returns { positions, teleports, via } or null.
 *   positions: [x, y] the robot occupies, start..end (one entry per move, plus the start)
 *   teleports: indices i into positions where move i was a teleport jump
 *   via: via[i] = the teleporter tile stepped onto for move i, or null (via[0] is null)
 */
export function routeWithMask(level, blocked) {
  const { size, grid, beacon, start } = level;
  const n = size * size;
  const open = new Uint8Array(n); // robot may step onto the cell
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = grid[y][x];
      if (c !== '#' && c !== '~' && !blocked[y * size + x]) open[y * size + x] = 1;
    }
  }
  // land[idx*4 + d] = index where a move from idx in direction d ends, or -1
  const land = new Int32Array(n * 4).fill(-1);
  const rev = Array.from({ length: n }, () => []);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = y * size + x;
      if (!open[u]) continue;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0];
        const ny = y + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const v = ny * size + nx;
        if (!open[v]) continue;
        let l = v;
        if (isTeleporter(grid[ny][nx])) {
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
    positions.push([next % size, Math.floor(next / size)]);
    if (isTeleporter(grid[sy][sx])) {
      teleports.push(positions.length - 1);
      via.push([sx, sy]);
    } else {
      via.push(null);
    }
    cur = next;
  }
  return { positions, teleports, via };
}

export function wallMask(level, walls) {
  const mask = new Uint8Array(level.size * level.size);
  for (const [x, y] of walls) mask[y * level.size + x] = 1;
  return mask;
}

/** Convenience wrapper: walls is an array of [x, y]. No validation (see simulate). */
export function findPath(level, walls = []) {
  return routeWithMask(level, wallMask(level, walls));
}
