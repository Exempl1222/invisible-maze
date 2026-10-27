// Which dates the daily page will play, and the rows of the archive list. Dates in, data out. No DOM.
import { parseDate, dayIndex } from '../play/daily.js';
import { addDays } from './streak.js';

/** How many past days (today minus 1 to today minus this) can be played. */
export const ARCHIVE_DAYS = 29;

/**
 * What to do with the page's ?date. `asked` is the raw query value, or null when there is none.
 *   today    no query, or today's own date
 *   archive  one of the 29 days before today
 *   future   after today: not ready
 *   old      older than the archive, or not a real date
 */
export function classifyDate(asked, today) {
  if (asked === null || asked === undefined || asked === today) return { kind: 'today', date: today };
  const t = parseDate(asked);
  if (t === null) return { kind: 'old', date: asked };
  const ago = dayIndex(asked, today);
  if (ago < 0) return { kind: 'future', date: asked };
  if (ago > ARCHIVE_DAYS) return { kind: 'old', date: asked };
  return { kind: 'archive', date: asked };
}

function resultOf(d) {
  if (d && d.done) return d.won ? { kind: 'won', stars: d.stars } : { kind: 'lost' };
  if (d && (d.tries > 0 || d.hint || (d.walls && d.walls.length))) return { kind: 'progress' };
  return { kind: 'none' };
}

/**
 * The archive list: today and the 29 days before it, newest first. Days outside the batch
 * (`start`, `count` puzzles) are left out. Each row: { date, number, today, result }.
 */
export function archiveRows({ days, today, start, count }) {
  const rows = [];
  for (let back = 0; back <= ARCHIVE_DAYS; back++) {
    const date = addDays(today, -back);
    const i = dayIndex(start, date);
    if (i === null || i < 0 || i >= count) continue;
    rows.push({ date, number: i + 1, today: back === 0, result: resultOf(days[date]) });
  }
  return rows;
}
