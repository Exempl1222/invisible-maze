// Plays one turn: validate the walls, find the robot's route, decide win or lose. Pure.
import { findPath } from './path.js';
import { capViolation, SIDE_CAP } from './level.js';

export function validateWalls(level, walls) {
  if (!Array.isArray(walls)) throw new Error('walls must be an array of [x, y, "R" or "D"]');
  const seen = new Set();
  for (const w of walls) {
    if (!Array.isArray(w) || w.length !== 3 || !Number.isInteger(w[0]) || !Number.isInteger(w[1])) {
      throw new Error(`wall must be [x, y, "R" or "D"] with integer x and y, got ${JSON.stringify(w)}`);
    }
    const [x, y, dir] = w;
    if (dir !== 'R' && dir !== 'D') {
      throw new Error(`wall ${JSON.stringify(w)} has direction ${JSON.stringify(dir)}: use "R" (right of the tile) or "D" (below it), the only canonical forms`);
    }
    if (!level.inBounds(x, y)) throw new Error(`wall [${x}, ${y}, "${dir}"] is outside the grid`);
    if ((dir === 'R' && x === level.size - 1) || (dir === 'D' && y === level.size - 1)) {
      throw new Error(`wall [${x}, ${y}, "${dir}"] is on the outer border, which is already a wall`);
    }
    if (!level.lineBuildable(x, y, dir)) {
      throw new Error(level.rules !== 'v3.1'
        ? `wall [${x}, ${y}, "${dir}"] is not buildable: both tiles beside a wall must be walkable (not river or rock)`
        : `wall [${x}, ${y}, "${dir}"] is not buildable: both tiles beside a wall must be plain grass (not the robot, beacon, bridge, teleporter, river or rock)`);
    }
    const key = `${x},${y},${dir}`;
    if (seen.has(key)) throw new Error(`duplicate wall at [${x}, ${y}, "${dir}"]`);
    seen.add(key);
  }
  if (walls.length > level.wallBudget) {
    throw new Error(`${walls.length} walls is over the budget of ${level.wallBudget}`);
  }
  const over = capViolation(level, walls);
  if (over) {
    throw new Error(`walls touch more than ${SIDE_CAP} sides of the ${over === 'start' ? 'robot' : 'beacon'}: the rules allow at most ${SIDE_CAP}`);
  }
}

/**
 * True if the walls leave the robot no route to the beacon (the move is illegal in the game).
 * Checks routing only; use validateWalls for the other wall rules. Rules v5 gnome tools: the
 * tool is ignored here, so the walls cut unless a route exists without it.
 */
export function cutsAllRoutes(level, walls) {
  const r = findPath(level, walls);
  return r === null || r.toolFreeRoute === false;
}

/**
 * Throws if the walls are invalid or cut every route. Results are only win/too-far and
 * lose/reached.
 * @returns {{result:'win'|'lose', reason:'too-far'|'reached',
 *            steps:number[][], teleports:number[], via:(number[]|null)[], movesUsed:number,
 *            trails?:number[][][], stuck?:number[]}}  (trails and stuck: rules v5 only)
 *  steps: positions the robot occupies, start first. teleports: indices into steps
 *  that were reached by a teleport jump.
 */
export function simulate(level, walls) {
  validateWalls(level, walls);
  const route = findPath(level, walls);
  if (route === null || route.toolFreeRoute === false) {
    throw new Error('The walls cut every route: the robot needs at least one way through to the beacon');
  }
  const length = route.positions.length - 1;
  // Rules v5 adds trails (tiles passed per move) and stuck (indices of the stuck-in-mud moves).
  const v5 = level.rules === 'v5';
  if (length > level.moveLimit) {
    const m = level.moveLimit;
    return {
      result: 'win',
      reason: 'too-far',
      steps: route.positions.slice(0, m + 1),
      teleports: route.teleports.filter((i) => i <= m),
      via: route.via.slice(0, m + 1),
      movesUsed: m,
      ...(v5 ? { trails: route.trails.slice(0, m + 1), stuck: route.stuck.filter((i) => i <= m) } : {}),
      ...toolFields(route, m),
    };
  }
  return {
    result: 'lose',
    reason: 'reached',
    steps: route.positions,
    teleports: route.teleports,
    via: route.via,
    movesUsed: length,
    ...(v5 ? { trails: route.trails, stuck: route.stuck } : {}),
    ...toolFields(route, length),
  };
}

/** Gnome tool fields (only on a level that has a tool): toolStep (null if past move m) and toolUse (kept if its prep move is within m). */
function toolFields(route, m) {
  if (!('toolStep' in route)) return {};
  const used = route.toolStep !== null && route.toolStep <= m;
  // Out of moves right after the prep move: he ends on the near side, but the UI still shows the prep.
  const prepped = route.toolUse !== null && route.toolUse.prep !== null && route.toolUse.prep <= m;
  return { toolStep: used ? route.toolStep : null, toolUse: used || prepped ? route.toolUse : null };
}
