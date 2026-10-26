// Data for the home-page hero replay: one real level (a daily level, rules v3.1) with its true par
// answer, the robot's true free route and the long walk it takes once the walls are down. Computed
// with the engine in Node and checked against it by tools/teaser.test.js, so the replay can't drift
// from the rules. Walls are [x, y, "R" | "D"]: the line right of / below tile [x, y].
export const TEASER = {
  id: 'd-2027-02-18',
  size: 9,
  tiles: [
    'B........',
    '~~~~...b.',
    '...~=~~=~',
    '........~',
    '....a....',
    '........R',
    '....a..b.',
    '.#.......',
    '.........',
  ],
  moveLimit: 14,
  par: 3,
  start: [8, 5],
  beacon: [0, 0],
  // Act 2: the par answer. It leaves the robot a way through, but a long one.
  walls: [[4, 0, 'D'], [5, 0, 'R'], [5, 1, 'R']],
  // Act 1: the robot's route with no walls. route[i] is where move i + 1 ends. The move
  // onto the teleporter at `jump.from` lands on `jump.to` (one move).
  route: [[8, 6], [7, 1], [7, 0], [6, 0], [5, 0], [4, 0], [3, 0], [2, 0], [1, 0], [0, 0]],
  jump: { from: [7, 6], to: [7, 1], move: 2 },
  // What the walls do: the robot walks `moveLimit` moves along its new shortest route (detour[i] is
  // where move i + 1 ends) and runs out of moves short of the beacon.
  detour: [[8, 4], [7, 4], [7, 3], [6, 3], [5, 3], [4, 3], [4, 2], [4, 1], [5, 1], [5, 0], [4, 0], [3, 0], [2, 0], [1, 0]],
  walled: { result: 'win', reason: 'too-far' },
};
