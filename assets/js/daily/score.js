// Scoring for the daily, out of 100. Pure. No DOM.
// A winning try with `fences` fences on a level of par `par` scores
//   max(30, round(100 - 70 * (fences - par) / (2 * par)))
// so par is 100 and three times par (or more) is the 30 floor. Fences can't be fewer than par; a
// count below it is read as par. The hint takes 15 off after the floor, so the lowest hinted win is 15.

export const HINT_COST = 15;
export const FLOOR = 30;

/** Score of one winning try. */
export function scoreFor(fences, par, hintUsed) {
  const over = Math.max(0, fences - par);
  const base = Math.max(FLOOR, Math.round(100 - (70 * over) / (2 * par)));
  return hintUsed ? base - HINT_COST : base;
}

/** The day's score: the best winning try, or 0 when no try won. `tries` is [{ won, score }]. */
export function bestScore(tries) {
  let best = 0;
  for (const t of tries ?? []) if (t.won && t.score > best) best = t.score;
  return best;
}

/** The hint was just used: every winning try so far loses HINT_COST (they are all above the floor, so none goes below 15). */
export function dockWins(tries) {
  return tries.map((t) => (t.won ? { ...t, score: Math.max(1, t.score - HINT_COST) } : t));
}

/** Score bands for the stats bars, best first. `min`/`max` are inclusive. */
export const BANDS = [
  { key: '100', label: '100', min: 100, max: 100 },
  { key: '80', label: '80 to 99', min: 80, max: 99 },
  { key: '60', label: '60 to 79', min: 60, max: 79 },
  { key: '30', label: '30 to 59', min: 30, max: 59 },
  { key: '1', label: '1 to 29', min: 1, max: 29 },
  { key: '0', label: '0', min: 0, max: 0 },
];

/** The key of the band a day score falls in. */
export function bandOf(score) {
  return BANDS.find((b) => score >= b.min && score <= b.max)?.key ?? '0';
}
