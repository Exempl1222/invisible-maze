// What the daily keeps on the device, as pure functions: clean up whatever was saved so a bad or
// hand-edited value can never break the page or hand back a try. No DOM, no storage.
//
// Saved state: { easy: { date: record }, hard: { date: record }, lastMode, seenHowTo }.
// A record: { tries: [{ fences, won, score, walls }], hint, walls, done, finishedOn }.
import { MAX_TRIES, MODES } from './config.js';
import { parseDate } from '../play/daily.js';
import { scoreFor } from './score.js';

const LINE_KEY = /^\d+,\d+,[RD]$/;

/** A fresh day: nothing tried yet. */
export const freshDay = () => ({ tries: [], hint: null, walls: [], done: false, finishedOn: null });

/** The state with nothing saved. */
export const emptySaved = () => ({ easy: {}, hard: {}, lastMode: null, seenHowTo: false });

/** "3,4,D" -> [3, 4, "D"], or null if it isn't a line key. */
export function parseLineKey(key) {
  if (typeof key !== 'string' || !LINE_KEY.test(key)) return null;
  const [x, y, dir] = key.split(',');
  return [Number(x), Number(y), dir];
}

function cleanKeys(list) {
  const out = [];
  if (Array.isArray(list)) for (const k of list) if (parseLineKey(k) && !out.includes(k)) out.push(k);
  return out;
}

function cleanTry(t) {
  if (!t || typeof t !== 'object') return null;
  const won = t.won === true;
  const fences = Number.isInteger(t.fences) && t.fences >= 0 ? t.fences : 0;
  const score = won ? (Number.isInteger(t.score) && t.score >= 1 && t.score <= 100 ? t.score : 1) : 0;
  const out = { fences, won, score };
  if (Array.isArray(t.walls)) out.walls = cleanKeys(t.walls);
  return out;
}

/** One day's record, repaired to something consistent. Never gives a try back. */
export function cleanDay(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return freshDay();
  const tries = [];
  if (Array.isArray(d.tries)) for (const t of d.tries) { const c = cleanTry(t); if (c && tries.length < MAX_TRIES) tries.push(c); }
  const done = d.done === true || tries.length >= MAX_TRIES; // all tries spent is a finished day, never a fresh board
  if (done && tries.length < 1) return freshDay(); // a finished day with no tries can't have happened
  const hint = parseLineKey(d.hint) ? d.hint : null;
  const finishedOn = done && typeof d.finishedOn === 'string' && parseDate(d.finishedOn) !== null ? d.finishedOn : null;
  return { tries, hint, walls: cleanKeys(d.walls), done, finishedOn };
}

/**
 * Two copies of one date's record (`a` already saved, `b` newer) as one, so two tabs can never
 * lose a spent try: the longer tries list wins; done stays set; an existing hint and finishedOn are
 * kept. The walls come from the finished copy, else the one with more tries, else the newer.
 */
export function mergeDay(a, b) {
  const x = a ? cleanDay(a) : null;
  const y = b ? cleanDay(b) : null;
  if (!x || !y) return x || y || freshDay();
  const base = x.done && !y.done ? x : y.done && !x.done ? y : x.tries.length > y.tries.length ? x : y.tries.length > x.tries.length ? y : y;
  const longer = x.tries.length >= y.tries.length ? x : y;
  return cleanDay({
    tries: longer.tries,
    hint: x.hint ?? y.hint,
    walls: base.walls,
    done: x.done || y.done,
    finishedOn: x.finishedOn ?? y.finishedOn,
  });
}

/** Two saved states (`a` already saved, `b` newer) as one: per-mode, per-date mergeDay; seenHowTo if either; the newer lastMode. */
export function mergeSaved(a, b) {
  const out = { lastMode: b.lastMode ?? a.lastMode ?? null, seenHowTo: a.seenHowTo || b.seenHowTo };
  for (const mode of MODES) {
    const days = { ...a[mode] };
    for (const [date, d] of Object.entries(b[mode] ?? {})) days[date] = mergeDay(days[date], d);
    out[mode] = days;
  }
  return out;
}

function parseJson(raw) {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** Parse the saved JSON text. Anything unreadable gives the empty state. */
export function parseSaved(raw) {
  const out = emptySaved();
  const saved = parseJson(raw);
  if (!saved) return out;
  for (const mode of MODES) {
    const m = saved[mode];
    if (m && typeof m === 'object' && !Array.isArray(m)) {
      for (const [date, d] of Object.entries(m)) if (parseDate(date) !== null) out[mode][date] = cleanDay(d);
    }
  }
  out.lastMode = MODES.includes(saved.lastMode) ? saved.lastMode : null;
  out.seenHowTo = saved.seenHowTo === true;
  return out;
}

export function serialize(state) {
  return JSON.stringify({ v: 2, easy: state.easy, hard: state.hard, lastMode: state.lastMode ?? null, seenHowTo: state.seenHowTo === true });
}

/**
 * v1 saved text -> a v2 state with the old days as Hard records, or null if there is nothing to carry.
 * `parOf(date)` is the Hard level's par for that date (null outside the batch, and that day is dropped).
 *   - a won day becomes one winning try, scored from its walls, the par and the hint
 *   - a finished lost day becomes all its lost tries (score 0)
 *   - an unfinished day keeps the tries it had spent, as lost tries, so none is given back
 * done and finishedOn are kept.
 */
export function migrateV1(raw, parOf) {
  const saved = parseJson(raw);
  if (!saved || !saved.days || typeof saved.days !== 'object' || Array.isArray(saved.days)) return null;
  const out = emptySaved();
  out.seenHowTo = saved.seenHowTo === true;
  for (const [date, d] of Object.entries(saved.days)) {
    if (parseDate(date) === null || !d || typeof d !== 'object') continue;
    const par = parOf(date);
    if (!Number.isInteger(par)) continue;
    const walls = cleanKeys(d.walls);
    const hint = parseLineKey(d.hint) ? d.hint : null;
    const spent = Number.isInteger(d.tries) ? Math.min(MAX_TRIES, Math.max(0, d.tries)) : 0;
    const won = d.won === true;
    const done = d.done === true || won || spent >= MAX_TRIES;
    let tries;
    if (won) tries = [{ fences: walls.length, won: true, score: scoreFor(walls.length, par, hint !== null), walls }];
    else tries = Array.from({ length: done ? MAX_TRIES : spent }, () => ({ fences: walls.length, won: false, score: 0 }));
    out.hard[date] = cleanDay({ tries, hint, walls, done, finishedOn: d.finishedOn });
    if (!done && tries.length === 0 && walls.length === 0 && hint === null) delete out.hard[date];
  }
  return out;
}
