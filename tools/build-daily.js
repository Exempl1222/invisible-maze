#!/usr/bin/env node
// Builds assets/levels/daily.json (shipped to the site). Offline, deterministic.
//
//   node tools/build-daily.js [--days 180] [--start 2026-10-27] [--seed 20261027] [--out assets/levels/daily.json]
//                             [--jobs 2] [--from 0 --to 180]   (build days [from, to) and merge into --out; for pieces under a time limit)
//
// One 9x9 level per calendar day: levels[0] is the start date, levels[i] is start + i days.
// Rules v4 (docs/GAME_SPEC.md): "rules": "v4", wallBudget = par + 2, par, parAnswers (counted up
// to 50, a single par answer is not required) and one par answer ("answer"). The weekday comes from
// the YYYY-MM-DD string in UTC (never the build machine's time zone) and sets the par:
// Monday to Wednesday par 4, Thursday to Saturday par 5, Sunday par 6 (the weekly hard day).
// Every level is ring-free with a route of at least 9; boards are unique within the batch. Each day
// has its own sub-seed, so the batch is a pure function of the seed, the start date and the day
// index (more days never change earlier ones). Par 6 takes about 11 s a level, so a full build is
// a few minutes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateLevels, formatStats } from './generate.js';

export const DAILY_DEFAULTS = { days: 180, start: '2026-10-27', seed: 20261027 };

/** YYYY-MM-DD plus n days, in UTC (no time zone surprises). */
export function addDays(date, n) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`date must be YYYY-MM-DD, got ${date}`);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Day of the week for a YYYY-MM-DD string, 0 = Sunday, computed in UTC. */
export function weekdayUTC(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`date must be YYYY-MM-DD, got ${date}`);
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Target par for a date: Mon-Wed 4, Thu-Sat 5, Sunday 6. */
export function dailyPar(date) {
  const wd = weekdayUTC(date);
  return wd === 0 ? 6 : wd <= 3 ? 4 : 5;
}

// Move-limit slack over the open route and solver work budget, by par (as the Lab levels are made).
const PAR_SETTINGS = {
  4: { slack: [4, 8], tries: 20000, maxNodes: 300000 },
  5: { slack: [6, 9], tries: 20000, maxNodes: 300000 },
  6: { slack: [8, 11], tries: 3000, maxNodes: 600000 },
};

/**
 * The level for day i: a pure function of (seed, start, i). Tries up to 20 sub-seeds and returns the first
 * level the generator keeps, with the generator's stats, or `{ level: null }` if none was found.
 */
export function buildDay(i, { start = DAILY_DEFAULTS.start, seed = DAILY_DEFAULTS.seed } = {}) {
  const par = dailyPar(addDays(start, i));
  const cfg = PAR_SETTINGS[par];
  const stats = { tried: 0, rejected: {}, usesTeleporter: 0 };
  for (let attempt = 0; attempt < 20; attempt++) {
    const gen = generateLevels({
      size: 9, count: 1, seed: `${seed}-${i}-${attempt}`, minPar: par, maxPar: par, minSlack: cfg.slack[0], maxSlack: cfg.slack[1],
      maxTries: cfg.tries, maxNodes: cfg.maxNodes, rules: 'v4', unique: false, budgetExtra: 2, answerCap: 50,
    });
    stats.tried += gen.stats.tried;
    for (const [k, v] of Object.entries(gen.stats.rejected)) stats.rejected[k] = (stats.rejected[k] ?? 0) + v;
    if (!gen.levels.length) continue;
    if (gen.meta[0].usesTeleporter) stats.usesTeleporter++;
    const { id, ...rest } = gen.levels[0]; // drop the generator's temporary id
    return { level: { id: `d-${addDays(start, i)}`, ...rest }, stats };
  }
  return { level: null, stats };
}

function addStats(total, st) {
  total.tried += st.tried;
  total.usesTeleporter += st.usesTeleporter;
  for (const [k, v] of Object.entries(st.rejected)) total.rejected[k] = (total.rejected[k] ?? 0) + v;
}

/** Builds days [from, to) of the batch in this thread. Boards must differ across the batch (checked by the caller). */
export function buildDaily({ days = DAILY_DEFAULTS.days, start = DAILY_DEFAULTS.start, seed = DAILY_DEFAULTS.seed, log = () => {} } = {}) {
  const levels = [];
  const total = { tried: 0, kept: 0, rejected: {}, usesTeleporter: 0 };
  for (let i = 0; i < days; i++) {
    const { level, stats } = buildDay(i, { start, seed });
    addStats(total, stats);
    if (!level) { log(`day ${i}: no level found, stopping at ${levels.length}`); break; }
    total.kept++;
    levels.push(level);
  }
  log(formatStats(total));
  return { id: 'daily', start, levels };
}

if (!isMainThread && workerData?.job === 'daily-days') {
  // worker: build the listed day indices and send them back
  const { indices, start, seed } = workerData;
  parentPort.postMessage(indices.map((i) => ({ i, ...buildDay(i, { start, seed }) })));
}

/** Builds days [from, to) across `jobs` worker threads. Day i is the same whoever builds it. */
async function buildRange({ from, to, start, seed, jobs }) {
  const lanes = Array.from({ length: jobs }, () => []);
  for (let i = from; i < to; i++) lanes[(i - from) % jobs].push(i);
  const parts = await Promise.all(lanes.filter((l) => l.length).map((indices) => new Promise((res, rej) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { job: 'daily-days', indices, start, seed } });
    w.once('message', res);
    w.once('error', rej);
  })));
  return parts.flat().sort((a, b) => a.i - b.i);
}

async function main() {
  const argv = process.argv.slice(2);
  const here = dirname(fileURLToPath(import.meta.url));
  const opts = { ...DAILY_DEFAULTS };
  let out = resolve(here, '../assets/levels/daily.json');
  let from = 0, to = null, jobs = Math.min(2, cpus().length);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--days') opts.days = Number(argv[++i]);
    else if (a === '--start') opts.start = argv[++i];
    else if (a === '--seed') opts.seed = Number(argv[++i]);
    else if (a === '--out') out = resolve(argv[++i]);
    else if (a === '--from') from = Number(argv[++i]); // build days [from, to) and merge them into --out
    else if (a === '--to') to = Number(argv[++i]);
    else if (a === '--jobs') jobs = Number(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  if (to === null) to = opts.days;
  const t0 = performance.now();
  // days already in --out (when building in pieces) are kept for indices outside [from, to)
  let existing = [];
  if (from > 0 && existsSync(out)) existing = JSON.parse(readFileSync(out, 'utf8')).levels.slice(0, from);
  if (existing.length !== from) throw new Error(`--from ${from} needs ${out} to hold at least ${from} levels (found ${existing.length})`);
  const built = await buildRange({ from, to, start: opts.start, seed: opts.seed, jobs });
  const total = { tried: 0, kept: 0, rejected: {}, usesTeleporter: 0 };
  const levels = existing.slice();
  for (const b of built) {
    addStats(total, b.stats);
    if (!b.level) throw new Error(`day ${b.i}: no level found`);
    total.kept++;
    levels.push(b.level);
  }
  console.log(formatStats(total));
  const boards = new Set(levels.map((l) => l.tiles.join('/')));
  if (boards.size !== levels.length) throw new Error('two days share a board; change the seed');
  const daily = { id: 'daily', start: opts.start, levels };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(daily, null, 1) + '\n');
  const pars = {};
  for (const l of daily.levels) pars[l.par] = (pars[l.par] ?? 0) + 1;
  console.log(`${daily.levels.length} levels from ${daily.start} (${daily.levels[0].id} to ${daily.levels.at(-1).id}), par mix ${JSON.stringify(pars)}`);
  console.log(`built days ${from}-${to - 1} on ${jobs} thread(s) in ${((performance.now() - t0) / 1000).toFixed(1)}s, wrote ${out}`);
  if (daily.levels.length < opts.days) console.log(`partial: ${daily.levels.length} of ${opts.days} days so far`);
}

if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
