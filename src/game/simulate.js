// Plays one turn: validate the walls, find the robot's route, decide win or lose. Pure.
import { findPath } from './path.js';

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
      throw new Error(`wall [${x}, ${y}, "${dir}"] is not buildable: both tiles beside a wall must be plain grass (not the robot, beacon, bridge, teleporter, river or rock)`);
    }
    const key = `${x},${y},${dir}`;
    if (seen.has(key)) throw new Error(`duplicate wall at [${x}, ${y}, "${dir}"]`);
    seen.add(key);
  }
  if (walls.length > level.wallBudget) {
    throw new Error(`${walls.length} walls is over the budget of ${level.wallBudget}`);
  }
}

/**
 * True if the walls leave the robot no route to the beacon (the move is illegal in the game).
 * Checks routing only; use validateWalls for the other wall rules.
 */
export function cutsAllRoutes(level, walls) {
  return findPath(level, walls) === null;
}

/**
 * Throws if the walls are invalid or cut every route. Results are only win/too-far and
 * lose/reached.
 * @returns {{result:'win'|'lose', reason:'too-far'|'reached',
 *            steps:number[][], teleports:number[], via:(number[]|null)[], movesUsed:number}}
 *  steps: positions the robot occupies, start first. teleports: indices into steps
 *  that were reached by a teleport jump.
 */
export function simulate(level, walls) {
  validateWalls(level, walls);
  const route = findPath(level, walls);
  if (route === null) {
    throw new Error('The walls cut every route: the robot needs at least one way through to the beacon');
  }
  const length = route.positions.length - 1;
  if (length > level.moveLimit) {
    const m = level.moveLimit;
    return {
      result: 'win',
      reason: 'too-far',
      steps: route.positions.slice(0, m + 1),
      teleports: route.teleports.filter((i) => i <= m),
      via: route.via.slice(0, m + 1),
      movesUsed: m,
    };
  }
  return { result: 'lose', reason: 'reached', steps: route.positions, teleports: route.teleports, via: route.via, movesUsed: length };
}
