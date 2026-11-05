// Solves a daily level in the browser, off the page's thread (v3.4: the answer is not shipped).
// In:  { raw }  the level as in the daily JSON (with its par, without an answer)
// Out: { ok: true, answer: [[x, y, 'R'|'D'], ...] } or { ok: false } if no par answer was found.
// It searches only at the stored par (opts.exactPar), so a Hard day takes about a second or two on a laptop.
// Always the same answer for the same level: the engine's search is deterministic.
import { solve } from '../../../src/game/index.js';
import { levelWithoutLimit } from './judge.js';

self.onmessage = (e) => {
  try {
    const raw = e.data.raw;
    const found = solve(levelWithoutLimit(raw), { exactPar: raw.par });
    self.postMessage(found ? { ok: true, answer: found.answer } : { ok: false });
  } catch {
    self.postMessage({ ok: false });
  }
};
