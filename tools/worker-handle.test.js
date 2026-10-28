// The stats Worker's handler against an in-memory fake of D1 (tools/worker-fake-d1.js). No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLevel, buildableLines, capViolation, cutsAllRoutes, simulate } from '../src/game/index.js';
import { handle, summarize, ALLOWED_ORIGINS } from '../worker/src/handle.js';
import { scoreFor, shownScore } from '../assets/js/daily/score.js';
import { judgeFences, levelWithoutLimit } from '../assets/js/daily/judge.js';
import { fakeD1 } from './worker-fake-d1.js';

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const LEVELS = { easy: readJson('../assets/levels/daily-easy.json'), hard: readJson('../assets/levels/daily.json') };
const ORIGIN = 'https://exempl1222.github.io';
const at = (date) => Date.parse(`${date}T12:00:00Z`);
const NOW = at('2026-10-27'); // day #1, index 0
const raw = (mode, i = 0) => LEVELS[mode].levels[i];
const dateOf = (i) => new Date(Date.parse('2026-10-27T00:00:00Z') + i * 86400000).toISOString().slice(0, 10);

function setup() {
  const db = fakeD1();
  const env = { DB: db, LEVELS };
  const call = (path, { method = 'GET', body, origin = ORIGIN, now = NOW, headers = {} } = {}) =>
    handle(new Request(`https://stats.example${path}`, {
      method,
      headers: { ...(origin ? { Origin: origin } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }), env, now);
  const post = (body, opts = {}) => call('/result', { method: 'POST', body, ...opts });
  return { db, env, call, post };
}
const payload = (over = {}) => ({ device: 'dev-aaaaaaaa', mode: 'easy', date: '2026-10-27', fences: raw('easy').answer, hint: false, tries: 1, ...over });
const bodyOf = async (res) => res.json();

/** `k` legal extra fences on top of the level's answer (off the answer, still a win, a route left). */
function withExtras(r, k) {
  const lv = levelWithoutLimit(r);
  const walls = r.answer.map((w) => [...w]);
  for (const line of buildableLines(lv)) {
    if (walls.length === r.answer.length + k) break;
    if (walls.some((w) => w.join(',') === line.join(','))) continue;
    const next = [...walls, line];
    if (capViolation(lv, next) !== null || cutsAllRoutes(lv, next) || simulate(lv, next).result !== 'win') continue;
    walls.push(line);
  }
  assert.equal(walls.length, r.answer.length + k);
  return walls;
}

test('a valid win at par scores 100, exactly as the page would', async () => {
  const { post, db } = setup();
  const res = await post(payload());
  assert.equal(res.status, 200);
  assert.deepEqual(await bodyOf(res), { ok: true, duplicate: false, score: 100 });
  assert.equal(db.results.size, 1);
  const row = [...db.results.values()][0];
  assert.deepEqual(row, { device: 'dev-aaaaaaaa', mode: 'easy', date: '2026-10-27', score: 100, tries: 1, hint: 0, received: '2026-10-27' });
});

test('the server score is the page score for every Easy and Hard day, with extra fences and the hint', async () => {
  for (const mode of ['easy', 'hard']) {
    for (let i = 0; i < 12; i++) {
      const r = raw(mode, i);
      const { post } = setup();
      const lv = levelWithoutLimit(r);
      for (const extra of [0, 1, 2]) {
        for (const hint of [false, true]) {
          const fences = withExtras(r, extra);
          const base = scoreFor(fences.length, lv.par);
          const want = shownScore({ won: true, base }, hint); // what the page shows for that try
          const res = await post(payload({ device: `dev-${mode}-${i}-${extra}-${hint}`, mode, date: dateOf(i), fences, hint }), { now: at(dateOf(i)) });
          assert.equal(res.status, 200, `${mode} ${i} +${extra}`);
          assert.equal((await bodyOf(res)).score, want, `${mode} day ${i} +${extra} hint ${hint}`);
          assert.equal(judgeFences(r, fences, hint).score, want);
        }
      }
    }
  }
});

test('the hint lowers the score by 15 and never below 15', async () => {
  const { post } = setup();
  const plain = await bodyOf(await post(payload({ device: 'dev-plain-1' })));
  const hinted = await bodyOf(await post(payload({ device: 'dev-hint-01', hint: true })));
  assert.equal(plain.score, 100);
  assert.equal(hinted.score, 85);
  const r = raw('easy');
  const many = withExtras(r, 6);
  const low = await bodyOf(await post(payload({ device: 'dev-hint-02', fences: many, hint: true })));
  assert.ok(low.score >= 15 && low.score === shownScore({ won: true, base: scoreFor(many.length, r.par) }, true));
});

test('null fences (a day with no win) scores 0 and is kept', async () => {
  const { post, db } = setup();
  const res = await post(payload({ fences: null, tries: 3 }));
  assert.equal(res.status, 200);
  assert.equal((await bodyOf(res)).score, 0);
  assert.equal([...db.results.values()][0].score, 0);
  assert.equal([...db.results.values()][0].tries, 3);
});

test('fences that are not on the grid, duplicated, unbuildable, over the side cap, cutting every route or losing are rejected', async () => {
  const r = raw('easy');
  const lv = levelWithoutLimit(r);
  const lines = buildableLines(lv);

  // an unbuildable but in-bounds interior line
  let unbuildable = null;
  for (let y = 0; y < lv.size - 1 && !unbuildable; y++) for (let x = 0; x < lv.size - 1 && !unbuildable; x++) for (const d of ['R', 'D']) if (!lv.lineBuildable(x, y, d)) { unbuildable = [x, y, d]; break; }
  assert.ok(unbuildable);

  // a day where the start has 3 buildable sides, and one where a set cuts every route
  const cases = [
    ['not a list', 'x'],
    ['an object', { 0: [1, 1, 'R'] }],
    ['a short fence', [[1, 1]]],
    ['a bad direction', [[1, 1, 'L']]],
    ['out of bounds', [[99, 1, 'R']]],
    ['the outer border', [[lv.size - 1, 0, 'R']]],
    ['non-integers', [[1.5, 1, 'R']]],
    ['a duplicate', [r.answer[0], ...r.answer]],
    ['an unbuildable line', [...r.answer, unbuildable]],
    ['no fences at all (the gnome gets home)', []],
    ['a short set that loses', r.answer.slice(0, -1)],
  ];
  for (const [name, fences] of cases) {
    const { post, db } = setup();
    const res = await post(payload({ fences }));
    assert.equal(res.status, 400, name);
    assert.equal((await bodyOf(res)).ok, false, name);
    assert.equal(db.results.size, 0, `${name} must not be stored`);
  }

  // over the side cap, using a day where the start has at least 3 open sides
  let capped = null;
  for (let i = 0; i < LEVELS.easy.levels.length && !capped; i++) {
    const l2 = levelWithoutLimit(raw('easy', i));
    const b2 = buildableLines(l2);
    const [x, y] = l2.start;
    const s = [[x, y - 1, 'D'], [x, y, 'D'], [x - 1, y, 'R'], [x, y, 'R']].filter((l) => b2.some((b) => b.join() === l.join()));
    if (s.length >= 3 && capViolation(l2, s.slice(0, 3)) === 'start') capped = { i, fences: s.slice(0, 3) };
  }
  assert.ok(capped, 'a day with 3 open sides at the start');
  {
    const { post, db } = setup();
    const res = await post(payload({ date: dateOf(capped.i), fences: capped.fences }), { now: at(dateOf(capped.i)) });
    assert.equal(res.status, 400);
    assert.match((await bodyOf(res)).error, /sides/);
    assert.equal(db.results.size, 0);
  }

  // a legal set that cuts every route (found with the engine; the cap holds, the gnome is shut in)
  const cut = [[5, 0, 'R'], [4, 1, 'D'], [1, 4, 'R']];
  const l6 = levelWithoutLimit(raw('easy', 6));
  assert.equal(capViolation(l6, cut), null);
  assert.equal(cutsAllRoutes(l6, cut), true);
  {
    const { post, db } = setup();
    const res = await post(payload({ date: dateOf(6), fences: cut }), { now: at(dateOf(6)) });
    assert.equal(res.status, 400);
    assert.match((await bodyOf(res)).error, /cut every route/);
    assert.equal(db.results.size, 0);
  }
});

test('the fences are judged against the server\'s own level, not whatever the client claims', async () => {
  const { post, db } = setup();
  // Day 0's answer posted for day 1 is a different board; it must not be accepted just because it won on day 0.
  const res = await post(payload({ date: dateOf(1), fences: raw('easy', 0).answer }), { now: at(dateOf(1)) });
  assert.equal(res.status, 400);
  assert.equal(db.results.size, 0);
});

test('bad device, mode, date, hint, tries and body are rejected', async () => {
  const bad = [
    { device: 'short' }, { device: 42 }, { device: 'has spaces in it' }, { mode: 'medium' }, { mode: undefined },
    { date: '2026-13-40' }, { date: 'tomorrow' }, { date: 20261027 }, { hint: 'yes' }, { hint: undefined },
    { tries: 0 }, { tries: 4 }, { tries: 1.5 }, { tries: '1' }, { fences: undefined },
  ];
  for (const over of bad) {
    const { post, db } = setup();
    const res = await post(payload(over));
    assert.equal(res.status, 400, JSON.stringify(over));
    assert.equal(db.results.size, 0);
  }
  const { post } = setup();
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post('[1,2]')).status, 400);
  assert.equal((await post('x'.repeat(10000))).status, 400);
});

test('the date window is the server UTC date minus 1 to plus 1; anything else is rejected', async () => {
  // Server UTC date is 28 Oct (day #2). 27, 28 and 29 Oct are open; 26 and 30 Oct are not.
  const now = at('2026-10-28');
  const open = [['2026-10-27', 0], ['2026-10-28', 1], ['2026-10-29', 2]];
  for (const [date, i] of open) {
    const { post } = setup();
    const res = await post(payload({ date, fences: raw('easy', i).answer }), { now });
    assert.equal(res.status, 200, date);
  }
  for (const date of ['2026-10-26', '2026-10-30', '2026-12-25', '2025-10-28']) {
    const { post, db } = setup();
    const res = await post(payload({ date, fences: raw('easy', 1).answer }), { now });
    assert.equal(res.status, 400, date);
    assert.equal(db.results.size, 0);
  }
  // before the batch starts there is no puzzle even though the window is open
  const { post } = setup();
  const res = await post(payload({ date: '2026-10-26' }), { now: at('2026-10-26') });
  assert.equal(res.status, 400);
  assert.match((await bodyOf(res)).error, /no puzzle/);
});

test('a repeat post for the same device, mode and date is ignored and never overwrites', async () => {
  const { post, db } = setup();
  const first = await post(payload({ tries: 2 }));
  assert.equal((await bodyOf(first)).duplicate, false);
  const worse = withExtras(raw('easy'), 3);
  const again = await post(payload({ fences: worse, tries: 3, hint: true }));
  assert.equal(again.status, 200);
  assert.deepEqual(await bodyOf(again), { ok: true, duplicate: true });
  assert.equal(db.results.size, 1);
  const row = [...db.results.values()][0];
  assert.equal(row.score, 100);
  assert.equal(row.tries, 2);
  assert.equal(row.hint, 0);
  // another mode, another date, another device are all separate results
  assert.equal((await bodyOf(await post(payload({ mode: 'hard', fences: raw('hard').answer })))).duplicate, false);
  assert.equal((await bodyOf(await post(payload({ device: 'dev-bbbbbbbb' })))).duplicate, false);
  assert.equal(db.results.size, 3);
});

test('counts stay in step with results; a repeat post bumps nothing; rejected posts write nothing', async () => {
  const { post, db } = setup();
  const r = raw('easy');
  const total = () => [...db.counts.values()].reduce((a, b) => a + b, 0);
  await post(payload({ device: 'dev-count-01' })); // 100
  await post(payload({ device: 'dev-count-02' })); // 100
  await post(payload({ device: 'dev-count-03', fences: null })); // 0
  await post(payload({ device: 'dev-count-04', fences: withExtras(r, 2) }));
  assert.equal(db.results.size, 4);
  assert.equal(total(), 4);
  assert.equal(db.counts.get('easy|2026-10-27|100'), 2);
  assert.equal(db.counts.get('easy|2026-10-27|0'), 1);
  // repeat posts (even with a different score) change neither table
  const dup = await bodyOf(await post(payload({ device: 'dev-count-01', fences: null })));
  assert.equal(dup.duplicate, true);
  assert.equal(db.results.size, 4);
  assert.equal(total(), 4);
  assert.equal(db.counts.get('easy|2026-10-27|100'), 2);
  assert.equal(db.counts.get('easy|2026-10-27|0'), 1);
  // rejected posts write nothing at all
  await post(payload({ device: 'dev-count-05', fences: [] }));
  await post(payload({ device: 'dev-count-05', mode: 'x' }));
  assert.equal(db.results.size, 4);
  assert.equal(total(), 4);
  // every results row is represented in counts, per mode, date and score
  const fromResults = new Map();
  for (const row of db.results.values()) { const k = `${row.mode}|${row.date}|${row.score}`; fromResults.set(k, (fromResults.get(k) ?? 0) + 1); }
  assert.deepEqual([...db.counts].sort(), [...fromResults].sort());
});

test('a failed batch leaves results and counts as they were', async () => {
  const { post, db, env } = setup();
  await post(payload({ device: 'dev-fail-001' }));
  const realBatch = db.batch.bind(db);
  db.batch = async (stmts) => realBatch([stmts[0], { sql: 'BROKEN', args: [] }]); // the count bump fails after the insert
  const res = await post(payload({ device: 'dev-fail-002' }));
  assert.equal(res.status, 500);
  assert.equal(db.results.size, 1);
  assert.equal(db.counts.get('easy|2026-10-27|100'), 1);
  assert.ok(env);
});

test('GET /stats gives players, the six bands and the score counts, read from counts', async () => {
  const { post, call, db } = setup();
  const r = raw('easy');
  const mk = (n, fences, extra = {}) => post(payload({ device: `dev-seed-${String(n).padStart(3, '0')}`, fences, ...extra }));
  await mk(1, r.answer); // 100
  await mk(2, r.answer); // 100
  await mk(3, r.answer, { hint: true }); // 85
  await mk(4, withExtras(r, 1)); // 88 or so on par 3
  await mk(5, withExtras(r, 3));
  await mk(6, null, { tries: 3 }); // 0
  await mk(7, r.answer, { mode: 'hard', fences: raw('hard').answer }); // hard, not counted in easy
  const res = await call('/stats?mode=easy&date=2026-10-27');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /json/);
  const stats = await bodyOf(res);
  assert.deepEqual(Object.keys(stats).sort(), ['bands', 'players', 'scores']);
  assert.deepEqual(Object.keys(stats.bands).sort(), ['0', '1-29', '100', '30-59', '60-79', '80-99']); // all six, whatever the order
  assert.equal(stats.players, 6);
  assert.equal(Object.values(stats.bands).reduce((a, b) => a + b, 0), 6);
  assert.equal(stats.bands['100'], 2);
  assert.equal(stats.bands['0'], 1);
  assert.equal(stats.scores['100'], 2);
  assert.equal(stats.scores['85'], 1);
  assert.equal(stats.scores['0'], 1);
  assert.equal(Object.values(stats.scores).reduce((a, b) => a + b, 0), 6);
  assert.ok(db.reads <= 101, 'stats read pre-counted rows only');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=60');

  const hard = await bodyOf(await call('/stats?mode=hard&date=2026-10-27'));
  assert.equal(hard.players, 1);
  const none = await bodyOf(await call('/stats?mode=easy&date=2026-10-28'));
  assert.deepEqual(none, { players: 0, bands: { 100: 0, '80-99': 0, '60-79': 0, '30-59': 0, '1-29': 0, 0: 0 }, scores: {} });
});

test('summarize puts each score in its band, edges included', () => {
  const rows = [100, 99, 80, 79, 60, 59, 30, 29, 1, 0].map((score) => ({ score, n: 1 }));
  const s = summarize(rows);
  assert.deepEqual(s.bands, { 100: 1, '80-99': 2, '60-79': 2, '30-59': 2, '1-29': 2, 0: 1 });
  assert.equal(s.players, 10);
});

test('GET /stats rejects a bad mode or date', async () => {
  const { call } = setup();
  assert.equal((await call('/stats?mode=x&date=2026-10-27')).status, 400);
  assert.equal((await call('/stats?mode=easy&date=nope')).status, 400);
  assert.equal((await call('/stats?mode=easy')).status, 400);
});

test('CORS: allowed origins get the headers, others get none; preflight answers 204', async () => {
  const { call, post } = setup();
  for (const origin of ALLOWED_ORIGINS) {
    const get = await call('/stats?mode=easy&date=2026-10-27', { origin });
    assert.equal(get.headers.get('access-control-allow-origin'), origin);
    assert.equal(get.headers.get('vary'), 'Origin');
    const pre = await call('/result', { method: 'OPTIONS', origin, headers: { 'Access-Control-Request-Method': 'POST' } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), origin);
    assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
    assert.match(pre.headers.get('access-control-allow-headers'), /Content-Type/i);
    const ok = await post(payload(), { origin });
    assert.equal(ok.headers.get('access-control-allow-origin'), origin);
  }
  const evil = 'https://evil.example';
  const get = await call('/stats?mode=easy&date=2026-10-27', { origin: evil });
  assert.equal(get.headers.get('access-control-allow-origin'), null);
  const pre = await call('/result', { method: 'OPTIONS', origin: evil });
  assert.equal(pre.headers.get('access-control-allow-origin'), null);
  const sneaky = await post(payload(), { origin: evil });
  assert.equal(sneaky.status, 403);
  assert.equal(sneaky.headers.get('access-control-allow-origin'), null);
  const lookalike = await call('/stats?mode=easy&date=2026-10-27', { origin: 'https://exempl1222.github.io.evil.example' });
  assert.equal(lookalike.headers.get('access-control-allow-origin'), null);
  const noOrigin = await call('/stats?mode=easy&date=2026-10-27', { origin: null });
  assert.equal(noOrigin.status, 200);
  assert.equal(noOrigin.headers.get('access-control-allow-origin'), null);
});

test('unknown paths, wrong methods and a broken database fail cleanly', async () => {
  const { call, env } = setup();
  assert.equal((await call('/nope')).status, 404);
  assert.equal((await call('/result')).status, 405);
  assert.equal((await call('/stats', { method: 'POST', body: {} })).status, 405);
  env.DB = { prepare() { throw new Error('d1 down'); } };
  const res = await handle(new Request('https://stats.example/stats?mode=easy&date=2026-10-27', { headers: { Origin: ORIGIN } }), env, NOW);
  assert.equal(res.status, 500);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN); // the page can still read the failure
  assert.deepEqual(await res.json(), { ok: false, error: 'server error' });
});

test('judgeFences needs nothing but the engine and the level (the page imports the same function)', () => {
  const r = raw('easy');
  assert.deepEqual(judgeFences(r, null, false), { ok: true, score: 0 });
  assert.deepEqual(judgeFences(r, r.answer, false), { ok: true, score: 100 });
  assert.deepEqual(judgeFences(r, r.answer, true), { ok: true, score: 85 });
  assert.equal(judgeFences(r, [], false).ok, false);
  assert.equal(judgeFences(r, 'x', false).ok, false);
});
