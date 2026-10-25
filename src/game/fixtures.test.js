// Shared test data (no tests here). Stripped from the deploy by the *.test.js rule.
// The level from the spec's "Level data format" section. The spec's example says par 2 with
// one answer; the engine (and a brute-force check in solve.test.js) says par 3 with one
// answer, so the fixture records the engine's numbers.
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
  moveLimit: 9,
  wallBudget: 4,
  par: 3,
  parAnswers: 1,
};

// The only par answer: seal the tile just past the bridge, whose three other sides are grass.
export const SPEC_ANSWER = [[1, 4, 'R'], [2, 4, 'R'], [2, 4, 'D']];

export function makeLevel(tiles, extra = {}) {
  return { id: 't', size: tiles.length, tiles, moveLimit: 20, wallBudget: 10, ...extra };
}
