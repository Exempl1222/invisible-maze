// Keeps a finished day's solved answer in localStorage, so "See the optimal solution" after a reload does not solve again.
// Only ever written once the day is done (main.js toggleSolution): before that the answer must not be on the device, so a
// hint can never leave the whole answer behind. One key per mode and date, apart from the daily's save, so the save format
// is untouched. Storage can be missing or throw: every access is wrapped and the page works without it.
// A cached answer is checked against the level before use (judgeFences: legal, wins, exactly par fences), so a damaged or
// edited entry is ignored and the solver runs as usual.
import { judgeFences } from './judge.js';

export const ANSWER_KEY_PREFIX = 'gnome-sweet-gnome:daily:answer:';
/** Entries older than this many days (by puzzle date) are dropped when a new one is written. */
const KEEP_DAYS = 45;

export const answerKey = (mode, date) => `${ANSWER_KEY_PREFIX}${mode}:${date}`;

const defaultStorage = () => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

/** The cached answer for this level, or null (none, unreadable, or not a par-sized winning set for this level). */
export function readCachedAnswer(raw, mode, date, storage = defaultStorage()) {
  try {
    const text = storage?.getItem(answerKey(mode, date));
    if (!text) return null;
    const walls = JSON.parse(text);
    if (!Array.isArray(walls) || walls.length !== raw.par) return null;
    const v = judgeFences(raw, walls, false);
    return v.ok && v.score === 100 ? walls.map((w) => [...w]) : null;
  } catch {
    return null;
  }
}

/** Remember the answer for a finished day. Call only when the day is done. Returns true if it was stored. */
export function writeCachedAnswer(mode, date, answer, storage = defaultStorage()) {
  try {
    if (!storage || !Array.isArray(answer) || answer.length === 0) return false;
    storage.setItem(answerKey(mode, date), JSON.stringify(answer));
    prune(date, storage);
    return true;
  } catch {
    return false;
  }
}

/** Drop answers whose puzzle date is far behind `date`. */
function prune(date, storage) {
  const cutoff = new Date(`${date}T00:00:00Z`).getTime() - KEEP_DAYS * 86400000;
  const stale = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(ANSWER_KEY_PREFIX)) {
      const d = Date.parse(`${k.slice(k.lastIndexOf(':') + 1)}T00:00:00Z`);
      if (Number.isFinite(d) && d < cutoff) stale.push(k);
    }
  }
  for (const k of stale) storage.removeItem(k);
}
