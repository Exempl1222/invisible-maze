// The daily's side of "everyone's scores" (docs/DAILY_SPEC.md, v3), as pure functions: what to send, which
// days still need sending, how to read the server's spread, and "you beat X%". No DOM, no network, no storage.
import { STATS_URL } from './config.js';
import { BANDS } from './score.js';
import { parseLineKey } from './record.js';
import { parseDate } from '../play/daily.js';

/** Players needed before "You beat X%" is shown. */
export const MIN_PLAYERS = 10;

const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

/**
 * The stats server's base URL, or null when the feature is off. `STATS_URL` in config.js is the switch.
 * Test hook: on localhost or 127.0.0.1 only, `?stats=<url>` replaces it (a relative path like `/__stats` works),
 * so browser tests can point the page at a stubbed route. On the real site the parameter is ignored.
 */
export function statsUrl(search, hostname, configured = STATS_URL) {
  let url = configured;
  if (LOCAL_HOSTS.includes(hostname)) {
    const asked = new URLSearchParams(search).get('stats');
    if (asked) url = asked;
  }
  return typeof url === 'string' && url !== '' ? url.replace(/\/+$/, '') : null;
}

/** The date before `date` (YYYY-MM-DD), or null if `date` is not a date. */
export function dayBefore(date) {
  const t = parseDate(date);
  return t === null ? null : new Date(t - 86400000).toISOString().slice(0, 10);
}

/** The winning try with the highest base score (the first on a tie), or null. */
function bestWin(day) {
  let best = null;
  for (const t of day.tries) if (t.won && (!best || t.base > best.base)) best = t;
  return best;
}

/**
 * The body to POST for one finished day, or null if it can't be sent: the day isn't done, wasn't finished on
 * its own date (an archive play), or its best win has no saved fences to prove it.
 *   { device, mode, date, fences: [[x, y, "R"|"D"], ...] | null, hint, tries }
 */
export function resultBody({ device, mode, date, day }) {
  if (!day || !day.done || day.finishedOn !== date || day.tries.length < 1) return null;
  const win = bestWin(day);
  let fences = null;
  if (win) {
    if (!Array.isArray(win.walls)) return null;
    fences = win.walls.map(parseLineKey);
    if (fences.some((f) => f === null)) return null;
  }
  return { device, mode, date, fences, hint: day.hint !== null, tries: day.tries.length };
}

/**
 * Finished days that still need sending: done, finished on their own date, not yet sent, and dated today or
 * yesterday (the server only takes those). `days` is { easy: { date: record }, hard: { ... } }.
 */
export function pendingResults(days, realToday) {
  const open = [realToday, dayBefore(realToday)];
  const out = [];
  for (const mode of Object.keys(days)) {
    for (const [date, day] of Object.entries(days[mode] ?? {})) {
      if (open.includes(date) && day.done && !day.sent && day.finishedOn === date) out.push({ mode, date, day });
    }
  }
  return out;
}

/**
 * What a POST's HTTP status means for the `sent` flag: 'sent' (the server has it, or already had it),
 * 'rejected' (the server refused this result for good, so stop trying) or 'retry' (try again next load).
 */
export function postOutcome(status) {
  if (status >= 200 && status < 300) return 'sent';
  if (status === 429 || status >= 500 || !Number.isInteger(status)) return 'retry';
  return status >= 400 ? 'rejected' : 'retry';
}

const SERVER_KEY = { 100: '100', 80: '80-99', 60: '60-79', 30: '30-59', 1: '1-29', 0: '0' };

/** The server's stats reply as { players, bands, scores }, or null if it isn't one. */
export function parseStats(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const { players, bands, scores } = json;
  if (!Number.isInteger(players) || players < 0) return null;
  if (!bands || typeof bands !== 'object') return null;
  const outBands = {};
  for (const b of BANDS) {
    const n = bands[SERVER_KEY[b.key]];
    if (!Number.isInteger(n) || n < 0) return null;
    outBands[b.key] = n;
  }
  const outScores = {};
  if (scores && typeof scores === 'object') {
    for (const [k, n] of Object.entries(scores)) if (/^\d{1,3}$/.test(k) && Number.isInteger(n) && n > 0) outScores[k] = n;
  }
  return { players, bands: outBands, scores: outScores };
}

/** The six bars, best first: [{ key, label, n }]. */
export const bandRows = (stats) => BANDS.map((b) => ({ key: b.key, label: b.label, n: stats.bands[b.key] }));

/**
 * "You beat X%": the share of the other players with a lower score, rounded down. `selfIncluded`: the
 * player's own result is among the posted ones (it was sent), so they are not counted as "other". Null below
 * MIN_PLAYERS players, or when there is nobody else.
 */
export function beatPercent(stats, score, selfIncluded) {
  if (!stats || stats.players < MIN_PLAYERS) return null;
  const others = stats.players - (selfIncluded ? 1 : 0);
  if (others < 1) return null;
  let lower = 0;
  for (const [s, n] of Object.entries(stats.scores)) if (Number(s) < score) lower += n;
  return Math.min(100, Math.floor((lower * 100) / others));
}
