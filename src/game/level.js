// Level parsing and validation. Pure: no DOM, no timers.
// Coordinates are [x, y] from the top left. Cell index = y * size + x.

const TELEPORTER = /^[a-z]$/;
const KNOWN = new Set(['.', '#', '~', '=', 'R', 'B']);

/** Rule sets a level can declare. Absent means the live rules, v3.1. */
export const RULES = ['v3.1', 'v4'];
/** Rules v4: a wall set may wall at most this many sides of the robot start, and of the beacon. */
export const SIDE_CAP = 2;

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
 * then column, then R before D. Rules v3.1 (guard rule): exactly the lines between two grass
 * tiles. Rules v4: every line between two walkable tiles (grass, start, beacon, bridge,
 * teleporter), still never river, rock or the outer border. The outer border never appears.
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

/** The two tiles beside a line, as [[x, y], [x2, y2]]. */
function lineTiles(x, y, dir) {
  return [[x, y], dir === 'R' ? [x + 1, y] : [x, y + 1]];
}

/**
 * How many walls touch the robot start and how many touch the beacon (a wall touches the two
 * tiles beside it). A line between the start and the beacon counts for both.
 */
export function sideCounts(level, walls) {
  let start = 0;
  let beacon = 0;
  for (const w of walls) {
    for (const [tx, ty] of lineTiles(w[0], w[1], w[2])) {
      if (tx === level.start[0] && ty === level.start[1]) start++;
      if (tx === level.beacon[0] && ty === level.beacon[1]) beacon++;
    }
  }
  return { start, beacon };
}

/**
 * Rules v4 side cap: null if the wall set is within it, else "start" or "beacon" for the first
 * one walled on more than SIDE_CAP sides. Always null under v3.1 (those lines can't be walled).
 */
export function capViolation(level, walls) {
  if (level.rules !== 'v4') return null;
  const c = sideCounts(level, walls);
  if (c.start > SIDE_CAP) return 'start';
  if (c.beacon > SIDE_CAP) return 'beacon';
  return null;
}

/**
 * For the UI: would adding `line` to `walls` break the side cap? Returns null if fine, else
 * "start" or "beacon" (the reason to show). Does not check anything else about the line.
 */
export function wouldBreakCap(level, walls, line) {
  return capViolation(level, [...walls, line]);
}

export function parseLevel(json) {
  if (json === null || typeof json !== 'object') fail('level must be an object');
  const rules = json.rules === undefined ? 'v3.1' : json.rules;
  if (!RULES.includes(rules)) fail(`rules must be one of ${RULES.map((r) => `"${r}"`).join(', ')}, got ${JSON.stringify(json.rules)}`);
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
    rules,
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
     * (x, y) and (x + 1, y)) or "D" (between (x, y) and (x, y + 1)). Rules v3.1: both tiles
     * must be grass (never the border, the start, the beacon, a bridge, a teleporter, river or
     * rock). Rules v4: both tiles must be walkable (never the border, river or rock). The v4
     * cap on walled sides of the start and beacon belongs to a wall set, not a line: see
     * capViolation.
     */
    lineBuildable(x, y, dir) {
      if (dir !== 'R' && dir !== 'D') return false;
      const x2 = dir === 'R' ? x + 1 : x;
      const y2 = dir === 'D' ? y + 1 : y;
      if (rules === 'v4') return level.walkable(x, y) && level.walkable(x2, y2);
      return tile(x, y) === '.' && tile(x2, y2) === '.';
    },
  };
  if (json.par !== undefined) level.par = json.par;
  if (json.answer !== undefined) level.answer = json.answer;
  if (json.parAnswers !== undefined) level.parAnswers = json.parAnswers;
  return level;
}
