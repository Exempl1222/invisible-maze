// Plays one turn: validate the walls, find the robot's route, decide win or lose. Pure.
import { findPath } from './path.js';

export function validateWalls(level, walls) {
  if (!Array.isArray(walls)) throw new Error('walls must be an array of [x, y]');
  const seen = new Set();
  for (const w of walls) {
    if (!Array.isArray(w) || w.length !== 2 || !Number.isInteger(w[0]) || !Number.isInteger(w[1])) {
      throw new Error(`wall must be [x, y] integers, got ${JSON.stringify(w)}`);
    }
    const [x, y] = w;
    if (!level.inBounds(x, y)) throw new Error(`wall [${x}, ${y}] is outside the grid`);
    if (!level.buildable(x, y)) {
      throw new Error(`wall [${x}, ${y}] is not buildable: walls go on grass only (tile is '${level.tile(x, y)}')`);
    }
    const key = `${x},${y}`;
    if (seen.has(key)) throw new Error(`duplicate wall at [${x}, ${y}]`);
    seen.add(key);
  }
  if (walls.length > level.wallBudget) {
    throw new Error(`${walls.length} walls is over the budget of ${level.wallBudget}`);
  }
}

/**
 * @returns {{result:'win'|'lose', reason:'blocked'|'too-far'|'reached',
 *            steps:number[][], teleports:number[], movesUsed:number}}
 *  steps: positions the robot occupies, start first. teleports: indices into steps
 *  that were reached by a teleport jump.
 */
export function simulate(level, walls) {
  validateWalls(level, walls);
  const route = findPath(level, walls);
  if (route === null) {
    return { result: 'win', reason: 'blocked', steps: [[level.start[0], level.start[1]]], teleports: [], movesUsed: 0 };
  }
  const length = route.positions.length - 1;
  if (length > level.moveLimit) {
    const m = level.moveLimit;
    return {
      result: 'win',
      reason: 'too-far',
      steps: route.positions.slice(0, m + 1),
      teleports: route.teleports.filter((i) => i <= m),
      movesUsed: m,
    };
  }
  return { result: 'lose', reason: 'reached', steps: route.positions, teleports: route.teleports, movesUsed: length };
}
