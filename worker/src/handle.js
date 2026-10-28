// The stats server's request handling, with no Cloudflare-only code so node can test it.
//   handle(request, env, now) -> Response
// `env.DB` is the D1 binding, `env.LEVELS` is { easy, hard } (the level files, see levels.js), `now` is a
// Date or milliseconds. Routes: POST /result, GET /stats, OPTIONS (CORS preflight).
import { parseDate, dayIndex } from '../../assets/js/play/daily.js';
import { judgeFences } from '../../assets/js/daily/judge.js';
import { BANDS } from '../../assets/js/daily/score.js';
import { d1Store } from './store.js';

export const ALLOWED_ORIGINS = [
  'https://exempl1222.github.io',
  'http://localhost:4173',
  'http://127.0.0.1:4173', // the Playwright test server
];
export const MODES = ['easy', 'hard'];
export const MAX_POSTS_PER_DEVICE_PER_DAY = 30;
export const MAX_TRIES = 3;
const MAX_BODY = 8192;
const MAX_FENCES = 400;
const DEVICE = /^[A-Za-z0-9_-]{8,64}$/;

/** The stats bands as the server names them, best first. */
export const SERVER_BANDS = BANDS.map((b) => ({ key: b.min === b.max ? String(b.min) : `${b.min}-${b.max}`, min: b.min, max: b.max }));

function corsHeaders(origin) {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, origin, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(origin), ...extra },
  });
}
const fail = (status, error, origin) => json({ ok: false, error }, status, origin);

/** The UTC calendar date of `now` as YYYY-MM-DD. */
export const utcDay = (now) => new Date(now).toISOString().slice(0, 10);

/** { players, bands, scores } from [{ score, n }] rows. Bands always list all six keys. */
export function summarize(rows) {
  const bands = Object.fromEntries(SERVER_BANDS.map((b) => [b.key, 0]));
  const scores = {};
  let players = 0;
  for (const { score, n } of rows) {
    const band = SERVER_BANDS.find((b) => score >= b.min && score <= b.max);
    if (!band) continue;
    bands[band.key] += n;
    scores[String(score)] = (scores[String(score)] ?? 0) + n;
    players += n;
  }
  return { players, bands, scores };
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return { error: 'body too large' };
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? { value: v } : { error: 'body must be a JSON object' };
  } catch {
    return { error: 'body is not JSON' };
  }
}

async function postResult(request, env, now, origin) {
  const store = d1Store(env.DB);
  const body = await readJson(request);
  if (body.error) return fail(400, body.error, origin);
  const { device, mode, date, fences, hint, tries } = body.value;

  if (typeof device !== 'string' || !DEVICE.test(device)) return fail(400, 'bad device', origin);

  // The abuse limit comes first, and counts every post, good or bad.
  const today = utcDay(now);
  const count = await store.bumpRate(device, today);
  if (count > MAX_POSTS_PER_DEVICE_PER_DAY) return fail(429, 'too many posts today', origin);
  if (count === 1) await store.purgeRate(today); // once a day per device is plenty of tidying

  if (!MODES.includes(mode)) return fail(400, 'bad mode', origin);
  if (typeof date !== 'string' || parseDate(date) === null) return fail(400, 'bad date', origin);
  const away = dayIndex(date, today); // days from the posted date to the server's UTC date
  if (away === null || Math.abs(away) > 1) return fail(400, 'that day is not open for results', origin);
  if (typeof hint !== 'boolean') return fail(400, 'bad hint', origin);
  if (!Number.isInteger(tries) || tries < 1 || tries > MAX_TRIES) return fail(400, 'bad tries', origin);
  if (fences !== null && (!Array.isArray(fences) || fences.length > MAX_FENCES)) return fail(400, 'bad fences', origin);

  const batch = env.LEVELS?.[mode];
  const i = batch ? dayIndex(batch.start, date) : null;
  const raw = i === null || i < 0 ? undefined : batch.levels[i];
  if (!raw) return fail(400, 'no puzzle for that day', origin);

  const verdict = judgeFences(raw, fences, hint);
  if (!verdict.ok) return fail(400, verdict.error, origin);

  const kept = await store.saveResult({ device, mode, date, score: verdict.score, tries, hint, received: today });
  return json({ ok: true, duplicate: !kept, ...(kept ? { score: verdict.score } : {}) }, 200, origin);
}

async function getStats(url, env, origin) {
  const mode = url.searchParams.get('mode');
  const date = url.searchParams.get('date');
  if (!MODES.includes(mode)) return fail(400, 'bad mode', origin);
  if (parseDate(date) === null) return fail(400, 'bad date', origin);
  const rows = await d1Store(env.DB).spread(mode, date);
  return json(summarize(rows), 200, origin, { 'Cache-Control': 'public, max-age=60' });
}

/** Handle one request. Never throws: an unexpected failure is a 500 with no detail. */
export async function handle(request, env, now = Date.now()) {
  const origin = request.headers.get('Origin');
  try {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (origin && !ALLOWED_ORIGINS.includes(origin) && request.method === 'POST') return fail(403, 'origin not allowed', origin);
    if (request.method === 'POST' && url.pathname === '/result') return await postResult(request, env, now, origin);
    if (request.method === 'GET' && url.pathname === '/stats') return await getStats(url, env, origin);
    if (url.pathname === '/result' || url.pathname === '/stats') return fail(405, 'method not allowed', origin);
    return fail(404, 'not found', origin);
  } catch {
    return fail(500, 'server error', origin);
  }
}
