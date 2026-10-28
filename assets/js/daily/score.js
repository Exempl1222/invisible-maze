// Scoring for the daily, out of 100. Pure. No DOM.
// A winning try with `fences` fences on a level of par `par` scores
//   max(30, round(100 - 70 * (fences - par) / (2 * par)))
// so par is 100 and three times par (or more) is the 30 floor. Fences can't be fewer than par; a
// count below it is read as par. Tries are stored as `base` (no hint); the hint takes 15 off at read time, so the lowest hinted win is 15.

export const HINT_COST = 15;
export const FLOOR = 30;

/** The score of one winning try before any hint: what is stored (`base`). */
export function scoreFor(fences, par) {
  const over = Math.max(0, fences - par);
  return Math.max(FLOOR, Math.round(100 - (70 * over) / (2 * par)));
}

/** The score a try shows: its base, less the hint's cost when the hint was used (floor 15). Lost tries show 0. */
export function shownScore(t, hintUsed) {
  if (!t || !t.won) return 0;
  return hintUsed ? Math.max(HINT_COST, t.base - HINT_COST) : t.base;
}

/** The day's score: the best winning try as shown, or 0 when no try won. `tries` is [{ won, base }]. */
export function bestScore(tries, hintUsed) {
  let best = 0;
  for (const t of tries ?? []) best = Math.max(best, shownScore(t, hintUsed));
  return best;
}

/** The most a try can show: 100, or 85 with the hint. Nothing can beat it. */
export const maxScore = (hintUsed) => (hintUsed ? 100 - HINT_COST : 100);

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
