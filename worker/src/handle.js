// The stats server's request handling, with no Cloudflare-only code so node can test it.
//   handle(request, env, now, deps) -> Response
// `env.DB` is the D1 binding, `env.LEVELS` is { easy, hard } (the level files, see levels.js), `now` is a
// Date or milliseconds, `deps.fetch` is the fetch used to ask Cloudflare Turnstile (injected so tests can fake it).
// If `env.TURNSTILE_SECRET` is set every post needs a valid `turnstile` token; if not, the check is skipped.
// Routes: POST /result, GET /stats, OPTIONS (CORS preflight).
import { parseDate, dayIndex } from '../../assets/js/play/daily.js';
import { judgeFences } from '../../assets/js/daily/judge.js';
import { BANDS } from '../../assets/js/daily/score.js';
import { MAX_TRIES, LEGACY_MAX_TRIES, FIVE_TRIES_FROM } from '../../assets/js/daily/config.js';
import { isOpenDate } from '../../assets/js/daily/window.js';
import { d1Store } from './store.js';

export const ALLOWED_ORIGINS = [
  'https://gnomesweetgnome.app',
  'https://www.gnomesweetgnome.app',
  'https://exempl1222.github.io', // the old address; GitHub redirects it, kept so a stale tab can still post
  'http://localhost:4173',
  // The Playwright test server. These two localhost origins are allowed in production too: CORS only says which
  // pages may read replies, it is not a login, and every post is re-judged and limited the same way whatever its origin.
  'http://127.0.0.1:4173',
];
export const MODES = ['easy', 'hard'];
export { MAX_TRIES };
const MAX_BODY = 8192;
const NO_RESULT = `a day with no win takes all ${MAX_TRIES} tries`;
const MAX_FENCES = 400;
const DEVICE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_TOKEN = 2048; // Turnstile tokens are up to 2048 characters
// The only site a Turnstile token may have been solved on (siteverify reports it as `hostname`). The old github.io
// address is left out on purpose: GitHub redirects it to the custom domain, so no page can show the widget there.
export const TURNSTILE_HOSTNAME = 'gnomesweetgnome.app';
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

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
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_BODY) return { error: 'body too large', status: 413 };
  const text = await request.text();
  if (text.length > MAX_BODY) return { error: 'body too large', status: 413 };
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? { value: v } : { error: 'body must be a JSON object' };
  } catch {
    return { error: 'body is not JSON' };
  }
}

/**
 * Ask Cloudflare whether a Turnstile token is good. 'ok', 'bad' (missing, malformed or refused: 403) or
 * 'down' (Cloudflare could not be asked: 503, so the page retries later rather than giving the day up).
 * SPEC-QUESTION: an unreachable siteverify fails closed (503) rather than letting the post through.
 */
async function checkTurnstile(token, secret, doFetch) {
  if (typeof token !== 'string' || token === '' || token.length > MAX_TOKEN) return 'bad';
  try {
    const res = await doFetch(SITEVERIFY_URL, { method: 'POST', body: new URLSearchParams({ secret, response: token }) });
    if (!res.ok) return 'down';
    const out = await res.json();
    return out && out.success === true && out.hostname === TURNSTILE_HOSTNAME ? 'ok' : 'bad';
  } catch {
    return 'down';
  }
}

async function postResult(request, env, now, origin, deps) {
  // In-memory rate limit per caller address (Workers Rate Limiting binding). The address is used for this
  // and nothing else: it is never stored or logged. No binding (tests, local runs) means no limit.
  if (env.POST_LIMIT) {
    const { success } = await env.POST_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'none' });
    if (!success) return fail(429, 'too many requests', origin);
  }
  const body = await readJson(request);
  if (body.error) return fail(body.status ?? 400, body.error, origin);
  const { device, mode, date, fences, hint, tries, turnstile } = body.value;

  if (typeof device !== 'string' || !DEVICE.test(device)) return fail(400, 'bad device', origin);

  const today = utcDay(now);
  if (!MODES.includes(mode)) return fail(400, 'bad mode', origin);
  if (typeof date !== 'string' || parseDate(date) === null) return fail(400, 'bad date', origin);
  if (!isOpenDate(date, now)) return fail(400, 'that day is not open for results', origin); // a date someone has reached, or just left
  if (typeof hint !== 'boolean') return fail(400, 'bad hint', origin);
  if (!Number.isInteger(tries) || tries < 1 || tries > MAX_TRIES) return fail(400, 'bad tries', origin);
  // A day lost under the old 3-try cap is valid only for a date before the 5-try change (FIVE_TRIES_FROM).
  if (fences === null && tries !== MAX_TRIES && !(tries === LEGACY_MAX_TRIES && date < FIVE_TRIES_FROM))
    return fail(400, NO_RESULT, origin);
  if (fences !== null && (!Array.isArray(fences) || fences.length > MAX_FENCES)) return fail(400, 'bad fences', origin);

  const batch = env.LEVELS?.[mode];
  const i = batch ? dayIndex(batch.start, date) : null;
  const raw = i === null || i < 0 ? undefined : batch.levels[i];
  if (!raw) return fail(400, 'no puzzle for that day', origin);

  const verdict = judgeFences(raw, fences, hint);
  if (!verdict.ok) return fail(400, verdict.error, origin);

  if (env.TURNSTILE_SECRET) { // bot protection is on: the token is checked last, so only a good-looking result costs a lookup
    const check = await checkTurnstile(turnstile, env.TURNSTILE_SECRET, deps.fetch ?? fetch);
    if (check === 'bad') return fail(403, 'bot check failed', origin);
    if (check === 'down') return fail(503, 'bot check unavailable', origin);
  }

  const kept = await d1Store(env.DB).saveResult({ device, mode, date, score: verdict.score, tries, hint, received: today });
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
export async function handle(request, env, now = Date.now(), deps = {}) {
  const origin = request.headers.get('Origin');
  try {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (origin && !ALLOWED_ORIGINS.includes(origin) && request.method === 'POST') return fail(403, 'origin not allowed', origin);
    if (request.method === 'POST' && url.pathname === '/result') return await postResult(request, env, now, origin, deps);
    if (request.method === 'GET' && url.pathname === '/stats') return await getStats(url, env, origin);
    if (url.pathname === '/result' || url.pathname === '/stats') return fail(405, 'method not allowed', origin);
    return fail(404, 'not found', origin);
  } catch {
    return fail(500, 'server error', origin);
  }
}
