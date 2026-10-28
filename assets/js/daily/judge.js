// Judging a day's result from its fences, shared by the page and the stats server so they can never
// disagree on a score. Pure: the engine, the level data and score.js only. No DOM, no storage.
import { parseLevel, buildableLines, validateWalls, cutsAllRoutes, simulate } from '../../../src/game/index.js';
import { scoreFor, shownScore } from './score.js';

/** The level as the daily plays it: no fence limit, so the engine's budget is every buildable line. */
export function levelWithoutLimit(raw) {
  const n = buildableLines(parseLevel(raw)).length;
  return parseLevel({ ...raw, wallBudget: n });
}

/**
 * Judge a day's best fences against a raw level object.
 *   fences === null  -> { ok: true, score: 0 } (a day with no win)
 *   fences a winning, legal set -> { ok: true, score } with the v2 formula and the hint's 15 points off
 *   anything else (not an array, a bad / duplicate / unbuildable fence, over the side cap, cutting every
 *   route, or a set that does not fence the gnome in) -> { ok: false, error }
 */
export function judgeFences(raw, fences, hint) {
  if (fences === null) return { ok: true, score: 0 };
  if (!Array.isArray(fences)) return { ok: false, error: 'fences must be a list or null' };
  let level;
  try {
    level = levelWithoutLimit(raw);
  } catch {
    return { ok: false, error: 'bad level' };
  }
  try {
    validateWalls(level, fences); // shape, in bounds, buildable, no duplicates, side cap
    if (cutsAllRoutes(level, fences)) return { ok: false, error: 'the fences cut every route' };
    if (simulate(level, fences).result !== 'win') return { ok: false, error: 'the fences do not fence the gnome in' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'bad fences' };
  }
  const base = scoreFor(fences.length, level.par);
  return { ok: true, score: shownScore({ won: true, base }, hint === true) };
}
