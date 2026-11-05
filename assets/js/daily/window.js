// Which puzzle dates the stats server will take a result for, as pure functions shared by the page and the Worker
// (so the page never sends a day the server would refuse). No DOM, no network, no storage.
// A date is open if it is, or very recently was, a real local date somewhere on Earth: from the local date at
// UTC-12 (the last place to reach a date to leave it) minus a grace, up to the local date at UTC+14 (the first
// place to reach a date). The grace lets a finish just after midnight still post (docs/DAILY_SPEC.md, v3.5).
import { parseDate } from '../play/daily.js';

const HOUR = 3600000;
export const UTC_MINUS_MAX = 12; // the westmost clock, UTC-12
export const UTC_PLUS_MAX = 14; // the eastmost clock, UTC+14
export const GRACE_HOURS = 6;

const day = (ms) => new Date(ms).toISOString().slice(0, 10);

/** { first, last }: the oldest and newest open dates (YYYY-MM-DD) at `now` (a Date or milliseconds). */
export function openRange(now) {
  const t = new Date(now).getTime();
  return { first: day(t - (UTC_MINUS_MAX + GRACE_HOURS) * HOUR), last: day(t + UTC_PLUS_MAX * HOUR) };
}

/** True if `date` (YYYY-MM-DD) is within the open range at `now`. A malformed date is never open. */
export function isOpenDate(date, now) {
  if (parseDate(date) === null) return false;
  const { first, last } = openRange(now);
  return date >= first && date <= last; // plain dates compare correctly as text
}
