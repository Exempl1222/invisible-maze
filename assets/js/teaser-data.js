// Data for the home-page hero replay: one real level (the daily for 21 Nov 2026) with
// its true par answer and the robot's true free route. Computed with the engine in Node
// and checked against it by tools/teaser.test.js, so the replay can't drift from the rules.
// Walls are [x, y, "R" | "D"]: the line right of / below tile [x, y].
export const TEASER = {
  id: 'd-2026-11-21',
  size: 9,
  tiles: [
    '....~.#..',
    '#...~~...',
    '.#...=.B.',
    '.#..~~...',
    '...b=...#',
    'R..#~....',
    '....=#...',
    '.b#.~##a.',
    '.a..~....',
  ],
  moveLimit: 11,
  par: 3,
  start: [0, 5],
  beacon: [7, 2],
  // Act 2: the par answer.
  walls: [[3, 2, 'R'], [6, 3, 'D'], [7, 3, 'D']],
  // Act 1: the robot's route with no walls. route[i] is where move i + 1 ends. The move
  // onto the teleporter at `jump.from` lands on `jump.to` (one move).
  route: [[1, 5], [1, 6], [3, 4], [3, 3], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2]],
  jump: { from: [1, 7], to: [3, 4], move: 3 },
  // What the walls do: no route at all, so the robot stays put and is trapped.
  walled: { result: 'win', reason: 'blocked' },
};
