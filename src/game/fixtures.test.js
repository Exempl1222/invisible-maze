// Shared test data (no tests here). Stripped from the deploy by the *.test.js rule.
// The board from the spec's "Level data format" section, re-solved under rules v3.1 (the robot
// must keep a route). The spec's example says par 2 with one answer; the engine, and an independent
// brute force in solve.test.js, say par 5 with one answer at moveLimit 10, so the fixture
// records the engine's numbers (and a budget of par + 1).
export const SPEC_LEVEL = {
  id: 'p01-06',
  size: 7,
  tiles: [
    '.......',
    '..R....',
    '...#...',
    '~~=~~~~',
    'a......',
    '....B..',
    '......a',
  ],
  moveLimit: 10,
  wallBudget: 6,
  par: 5,
  parAnswers: 1,
};

// The only par answer: wall off the tile just past the bridge on its way to the beacon, and
// leave the long way round open.
export const SPEC_ANSWER = [[1, 4, 'R'], [2, 4, 'R'], [1, 5, 'R'], [2, 5, 'R'], [2, 6, 'R']];

export function makeLevel(tiles, extra = {}) {
  return { id: 't', size: tiles.length, tiles, moveLimit: 20, wallBudget: 10, ...extra };
}
