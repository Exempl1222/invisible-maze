// What the daily keeps on the device, as pure functions: clean up whatever was saved so a bad or
// hand-edited value can never break the page or hand back a try. No DOM, no storage.
import { MAX_TRIES } from './config.js';
import { parseDate } from '../play/daily.js';

const LINE_KEY = /^\d+,\d+,[RD]$/;

/** A fresh day: nothing tried yet. */
export const freshDay = () => ({ tries: 0, won: false, stars: 0, walls: [], hint: null, done: false, finishedOn: null });

/** "3,4,D" -> [3, 4, "D"], or null if it isn't a line key. */
export function parseLineKey(key) {
  if (typeof key !== 'string' || !LINE_KEY.test(key)) return null;
  const [x, y, dir] = key.split(',');
  return [Number(x), Number(y), dir];
}

/** One day's record, repaired to something consistent. Never gives a try back. */
export function cleanDay(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return freshDay();
  let tries = Number.isInteger(d.tries) ? Math.min(MAX_TRIES, Math.max(0, d.tries)) : 0;
  const won = d.won === true;
  let done = d.done === true || won || tries >= MAX_TRIES; // all tries spent is a finished day, never a fresh board
  if (won && tries < 1) tries = 1;
  if (done && tries < 1) return freshDay(); // a finished day with no tries can't have happened
  let stars = 0;
  if (won) stars = Number.isInteger(d.stars) && d.stars >= 1 && d.stars <= 3 ? d.stars : 1;
  const walls = [];
  if (Array.isArray(d.walls)) for (const k of d.walls) if (parseLineKey(k) && !walls.includes(k)) walls.push(k);
  const hint = parseLineKey(d.hint) ? d.hint : null;
  const finishedOn = done && typeof d.finishedOn === 'string' && parseDate(d.finishedOn) !== null ? d.finishedOn : null;
  return { tries, won, stars, walls, hint, done, finishedOn };
}

/**
 * Two copies of one date's record (`a` already saved, `b` newer) as one, so two tabs can never
 * lose a spent try: highest tries; done and won stay set (the finished copy's stars and walls win);
 * an existing hint and finishedOn are kept. With equal tries the newer walls win.
 */
export function mergeDay(a, b) {
  const x = a ? cleanDay(a) : null;
  const y = b ? cleanDay(b) : null;
  if (!x || !y) return x || y || freshDay();
  const base = x.done ? x : y.done ? y : x.tries > y.tries ? x : y;
  const done = x.done || y.done;
  return cleanDay({
    tries: Math.max(x.tries, y.tries),
    won: x.won || y.won,
    done,
    stars: base.stars,
    walls: base.walls,
    hint: x.hint ?? y.hint,
    finishedOn: x.finishedOn ?? y.finishedOn,
  });
}

/** Two saved states (`a` already saved, `b` newer) as one: per-date mergeDay, seenHowTo if either. */
export function mergeSaved(a, b) {
  const days = { ...a.days };
  for (const [date, d] of Object.entries(b.days)) days[date] = mergeDay(days[date], d);
  return { seenHowTo: a.seenHowTo || b.seenHowTo, days };
}

/** Parse the saved JSON text into { seenHowTo, days }. Anything unreadable gives the empty state. */
export function parseSaved(raw) {
  const empty = { seenHowTo: false, days: {} };
  if (!raw) return empty;
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return empty;
  const days = {};
  if (saved.days && typeof saved.days === 'object' && !Array.isArray(saved.days)) {
    for (const [date, d] of Object.entries(saved.days)) if (parseDate(date) !== null) days[date] = cleanDay(d);
  }
  return { seenHowTo: saved.seenHowTo === true, days };
}

export function serialize(state) {
  return JSON.stringify({ v: 1, seenHowTo: state.seenHowTo === true, days: state.days });
}
