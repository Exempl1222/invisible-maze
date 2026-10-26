// Data for the home-page hero replay: one real level (a daily level, rules v4) with its true par
// answer, the robot's true free route and the long walk it takes once the walls are down. Computed
// with the engine in Node and checked against it by tools/teaser.test.js, so the replay can't drift
// from the rules. Walls are [x, y, "R" | "D"]: the line right of / below tile [x, y]. The two walls at
// the beacon are rules v4 at work: a beacon may be walled on up to 2 sides.
export const TEASER = {
  id: 'd-2026-12-15',
  size: 9,
  rules: 'v4',
  tiles: [
    '.#.~~....',
    '..R.=....',
    '...~~....',
    '...=...#.',
    '..~~.....',
    '.a~....#.',
    '..=......',
    '..~a...B.',
    '..~..#...',
  ],
  moveLimit: 13,
  par: 4,
  start: [2, 1],
  beacon: [7, 7],
  // Act 2: the par answer. It leaves the robot a way through, but a long one.
  walls: [[6, 6, 'D'], [7, 6, 'D'], [5, 7, 'R'], [7, 7, 'R']],
  // Act 1: the robot's route with no walls. route[i] is where move i + 1 ends. The move
  // onto the teleporter at `jump.from` lands on `jump.to` (one move).
  route: [[2, 2], [2, 3], [1, 3], [1, 4], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7]],
  jump: { from: [1, 5], to: [3, 7], move: 5 },
  // What the walls do: the robot walks `moveLimit` moves along its new shortest route (detour[i] is
  // where move i + 1 ends) and runs out of moves short of the beacon.
  detour: [[3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 6], [8, 7], [8, 8]],
  walled: { result: 'win', reason: 'too-far' },
};
