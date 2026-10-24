// Shared test data (no tests here). Stripped from the deploy by the *.test.js rule.
export const SPEC_LEVEL = {
  id: 'd-2026-10-24',
  size: 9,
  tiles: [
    '.....=~..',
    '......~..',
    '..R...~..',
    '......=..',
    '...#..~..',
    '......=..',
    '......=..',
    '...#..~~B',
    'a...#..~a',
  ],
  moveLimit: 13,
  wallBudget: 4,
  par: 3,
  parAnswers: 1,
};

export const SPEC_ANSWER = [[8, 6], [0, 7], [1, 8]];

export function makeLevel(tiles, extra = {}) {
  return { id: 't', size: tiles.length, tiles, moveLimit: 20, wallBudget: 10, ...extra };
}
