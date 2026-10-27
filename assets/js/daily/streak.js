// Streaks and stats from the saved days. Dates in, numbers out. No DOM.
import { parseDate } from '../play/daily.js';

/** The date `n` days after `date` ("YYYY-MM-DD"). Goes through UTC so clock changes can't shift it. */
export function addDays(date, n) {
  const d = new Date(parseDate(date) + n * 86400000);
  const p = (v) => String(v).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

const resultOf = (d) => (d.won ? String(Math.min(3, Math.max(1, d.stars))) : 'lost');

/**
 * { played, wins, winPct, current, best, dist, today } for `days` (date -> saved day), as seen on
 * `today`. Current streak: consecutive dates won on the day itself (`finishedOn` is the date; archive
 * catch-ups don't count) ending today, or yesterday if today isn't done
 * yet. A lost or missed day ends it. `today` in the result is the key of today's result in `dist`,
 * or null if today isn't done.
 */
export function computeStats(days, today) {
  const done = Object.entries(days).filter(([, d]) => d.done);
  const dist = { 3: 0, 2: 0, 1: 0, lost: 0 };
  const wonDates = new Set(); // every win, for played and win %
  const streakDates = new Set(); // wins finished on their own date: the only ones a streak counts
  for (const [date, d] of done) {
    dist[resultOf(d)]++;
    if (d.won) {
      wonDates.add(date);
      if (!d.finishedOn || d.finishedOn === date) streakDates.add(date); // no finishedOn: an older save, taken as on the day
    }
  }
  const wins = wonDates.size;
  const played = done.length;

  let best = 0;
  for (const date of streakDates) {
    if (streakDates.has(addDays(date, -1))) continue; // not the start of a run
    let len = 0;
    for (let d = date; streakDates.has(d); d = addDays(d, 1)) len++;
    best = Math.max(best, len);
  }

  const todayDone = days[today]?.done === true;
  let anchor = todayDone ? today : addDays(today, -1);
  let current = 0;
  while (streakDates.has(anchor)) {
    current++;
    anchor = addDays(anchor, -1);
  }

  return {
    played,
    wins,
    winPct: played ? Math.round((wins / played) * 100) : 0,
    current,
    best,
    dist,
    today: todayDone ? resultOf(days[today]) : null,
  };
}
