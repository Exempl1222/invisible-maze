// Level parsing and validation. Pure: no DOM, no timers.
// Coordinates are [x, y] from the top left. Cell index = y * size + x.

const TELEPORTER = /^[a-z]$/;
const KNOWN = new Set(['.', '#', '~', '=', 'R', 'B']);

function fail(msg) {
  throw new Error(`Invalid level: ${msg}`);
}

/** Index of a line inside a line mask: 2 * (y * size + x) + (0 for "R", 1 for "D"). */
export function lineIndex(level, x, y, dir) {
  return (y * level.size + x) * 2 + (dir === 'D' ? 1 : 0);
}

/** Inverse of lineIndex: the canonical wall [x, y, "R" | "D"]. */
export function lineWall(level, idx) {
  const cell = idx >> 1;
  const x = cell % level.size;
  return [x, (cell - x) / level.size, idx & 1 ? 'D' : 'R'];
}

/**
 * Every line that can take a wall, as canonical walls [x, y, "R" | "D"], ordered by row,
 * then column, then R before D. By the guard rule these are exactly the lines between two
 * grass tiles; the outer border never appears.
 */
export function buildableLines(level) {
  const out = [];
  for (let y = 0; y < level.size; y++) {
    for (let x = 0; x < level.size; x++) {
      if (level.lineBuildable(x, y, 'R')) out.push([x, y, 'R']);
      if (level.lineBuildable(x, y, 'D')) out.push([x, y, 'D']);
    }
  }
  return out;
}

export function parseLevel(json) {
  if (json === null || typeof json !== 'object') fail('level must be an object');
  const { size, tiles, moveLimit, wallBudget } = json;
  if (!Number.isInteger(size) || size < 2) fail(`size must be an integer of at least 2, got ${size}`);
  if (!Array.isArray(tiles) || tiles.length !== size) {
    fail(`size is ${size} but tiles has ${Array.isArray(tiles) ? tiles.length : 'no'} rows (grid must be square)`);
  }
  if (!Number.isInteger(moveLimit) || moveLimit < 1) fail(`moveLimit must be a positive integer, got ${moveLimit}`);
  if (!Number.isInteger(wallBudget) || wallBudget < 0) fail(`wallBudget must be a non-negative integer, got ${wallBudget}`);

  const grid = [];
  const starts = [];
  const beacons = [];
  const letters = new Map(); // letter -> [[x, y], ...]
  tiles.forEach((row, y) => {
    if (typeof row !== 'string' || row.length !== size) {
      fail(`row ${y} must be a string of ${size} characters (grid must be square), got ${JSON.stringify(row)}`);
    }
    grid.push([...row]);
    [...row].forEach((c, x) => {
      if (c === 'R') starts.push([x, y]);
      else if (c === 'B') beacons.push([x, y]);
      else if (TELEPORTER.test(c)) {
        if (!letters.has(c)) letters.set(c, []);
        letters.get(c).push([x, y]);
      } else if (!KNOWN.has(c)) fail(`unknown tile ${JSON.stringify(c)} at [${x}, ${y}]`);
    });
  });
  if (starts.length !== 1) fail(`need exactly one robot start 'R', found ${starts.length}`);
  if (beacons.length !== 1) fail(`need exactly one beacon 'B', found ${beacons.length}`);

  const partners = new Map(); // cell index -> [x, y] of partner
  for (const [letter, cells] of letters) {
    if (cells.length !== 2) fail(`teleporter '${letter}' must appear exactly twice, found ${cells.length}`);
    const [p, q] = cells;
    partners.set(p[1] * size + p[0], q);
    partners.set(q[1] * size + q[0], p);
  }

  const inBounds = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < size && y < size;
  const tile = (x, y) => (inBounds(x, y) ? grid[y][x] : null);

  const level = {
    id: json.id,
    size,
    tiles: tiles.slice(),
    grid,
    start: starts[0],
    beacon: beacons[0],
    partners,
    moveLimit,
    wallBudget,
    inBounds,
    tile,
    /** Teleporter partner of the tile at (x, y) as [x, y], or null. */
    partner(x, y) {
      return partners.get(y * size + x) ?? null;
    },
    /** Can the robot stand on / step onto this tile (ignoring player walls)? */
    walkable(x, y) {
      const c = tile(x, y);
      return c !== null && c !== '#' && c !== '~';
    },
    /**
     * Can the line on the `dir` side of tile (x, y) take a wall? dir is "R" (between
     * (x, y) and (x + 1, y)) or "D" (between (x, y) and (x, y + 1)). Both tiles must be
     * grass: never the border, the start, the beacon, a bridge, a teleporter, river or rock.
     */
    lineBuildable(x, y, dir) {
      if (dir !== 'R' && dir !== 'D') return false;
      const x2 = dir === 'R' ? x + 1 : x;
      const y2 = dir === 'D' ? y + 1 : y;
      return tile(x, y) === '.' && tile(x2, y2) === '.';
    },
  };
  if (json.par !== undefined) level.par = json.par;
  if (json.parAnswers !== undefined) level.parAnswers = json.parAnswers;
  return level;
}
