// Level parsing and validation. Pure: no DOM, no timers.
// Coordinates are [x, y] from the top left. Cell index = y * size + x.

const TELEPORTER = /^[a-z]$/;
const KNOWN = new Set(['.', '#', '~', '=', 'R', 'B']);

function fail(msg) {
  throw new Error(`Invalid level: ${msg}`);
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
    /** Only grass can take a wall. */
    buildable(x, y) {
      return tile(x, y) === '.';
    },
  };
  if (json.par !== undefined) level.par = json.par;
  if (json.parAnswers !== undefined) level.parAnswers = json.parAnswers;
  return level;
}
