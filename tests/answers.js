// The daily files hold no answer (v3.4: the page works it out in the browser). Tests that press the par
// answer into the page get it the same way: the engine, at the level's stored par. Not a spec file.
import { solve } from '../src/game/index.js';
import { levelWithoutLimit } from '../assets/js/daily/judge.js';

const cache = new Map();

/** The raw daily level plus `answer` (the engine's par answer, the same one the page's solver finds). */
export function withAnswer(raw) {
  if (!cache.has(raw)) {
    const found = solve(levelWithoutLimit(raw), { exactPar: raw.par });
    if (!found) throw new Error(`${raw.id} has no answer at its par`);
    cache.set(raw, { ...raw, answer: found.answer });
  }
  return cache.get(raw);
}
