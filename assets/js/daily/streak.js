// Streaks and stats from the saved days. Dates in, numbers out. No DOM.
import { parseDate } from '../play/daily.js';

/** The date `n` days after `date` ("YYYY-MM-DD"). Goes through UTC so clock changes can't shift it. */
export function addDays(date, n) {
  const d = new Date(parseDate(date) + n * 86400000);
  const p = (v) => String(v).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

import { bestScore, bandOf, BANDS } from './score.js';

/**
 * Stats for one mode's saved `days` (date -> record), as seen on `today`:
 * { played, wins, winPct, average, bestScore, current, bestStreak, dist, today }.
 * A day is played when it is done; its score is the best winning try (0 for a day with no win) and a
 * win is a score above 0. `average` is over played days, lost days counting 0. `dist` counts days per
 * score band (see BANDS). Current streak: consecutive dates with a score above 0, finished on the
 * day itself (`finishedOn` is the date; archive catch-ups don't count), ending today, or yesterday if
 * today isn't done yet. A lost or missed day ends it. `today` in the result is today's band key, or
 * null if today isn't done.
 */
export function computeStats(days, today) {
  const done = Object.entries(days).filter(([, d]) => d.done);
  const dist = Object.fromEntries(BANDS.map((b) => [b.key, 0]));
  const streakDates = new Set(); // wins finished on their own date: the only ones a streak counts
  let wins = 0;
  let total = 0;
  let top = 0;
  for (const [date, d] of done) {
    const score = bestScore(d.tries, d.hint != null);
    dist[bandOf(score)]++;
    total += score;
    top = Math.max(top, score);
    if (score > 0) {
      wins++;
      if (!d.finishedOn || d.finishedOn === date) streakDates.add(date); // no finishedOn: an older save, taken as on the day
    }
  }
  const played = done.length;

  let bestStreak = 0;
  for (const date of streakDates) {
    if (streakDates.has(addDays(date, -1))) continue; // not the start of a run
    let len = 0;
    for (let d = date; streakDates.has(d); d = addDays(d, 1)) len++;
    bestStreak = Math.max(bestStreak, len);
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
    average: played ? Math.round(total / played) : 0,
    bestScore: top,
    current,
    bestStreak,
    dist,
    today: todayDone ? bandOf(bestScore(days[today].tries, days[today].hint != null)) : null,
  };
}
