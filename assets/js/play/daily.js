// Date maths for the daily level. Dates are "YYYY-MM-DD" strings in the player's local calendar.
// Days are counted through UTC midnights so daylight saving can never shift a day. No DOM.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The local calendar date of `d` as "YYYY-MM-DD". */
export function localDateString(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Milliseconds at UTC midnight for a real "YYYY-MM-DD" date, or null if it isn't one. */
export function parseDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d ? t : null;
}

/** Whole days from `start` to `date` (negative before the start), or null if either is invalid. */
export function dayIndex(start, date) {
  const a = parseDate(start);
  const b = parseDate(date);
  return a === null || b === null ? null : Math.round((b - a) / 86400000);
}

/** "Tue 27 Oct" */
export function formatDaily(date) {
  const t = parseDate(date);
  if (t === null) return date;
  const d = new Date(t);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
