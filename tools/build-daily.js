#!/usr/bin/env node
// Builds assets/levels/daily.json (shipped to the site). Offline, deterministic.
//
//   node tools/build-daily.js [--days 180] [--start 2026-10-27] [--seed 20261027] [--out assets/levels/daily.json]
//
// One 9x9 level per calendar day: levels[0] is the start date, levels[i] is start + i days.
// Every level is generated with the pack's filters (route >= 9, no ring answer, exactly one
// par answer) and par 3 to 6 (every third day par 4+, every 15th par 5+), budget = par + 1.
// Boards are unique within the batch. Each day has its own sub-seed, so the batch is a pure
// function of the seed, the start date and the day index (more days never change earlier ones).
import { mkdirSync, writeFileSync } from 'node:fs';
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

/** Minimum par asked of day i: mostly 3, every third day 4 or more, every 15th day 5 or more. */
export function dailyMinPar(i) {
  return i % 15 === 14 ? 5 : i % 3 === 2 ? 4 : 3;
}

export function buildDaily({ days = DAILY_DEFAULTS.days, start = DAILY_DEFAULTS.start, seed = DAILY_DEFAULTS.seed, log = () => {} } = {}) {
  // Each day is generated on its own sub-seed, so the batch is a pure function of
  // (seed, start, day index) and the first N days never change when more days are added.
  const levels = [];
  const boards = new Set();
  const total = { tried: 0, kept: 0, rejected: {}, usesTeleporter: 0 };
  for (let i = 0; i < days; i++) {
    let level = null;
    for (let attempt = 0; attempt < 20 && !level; attempt++) {
      const gen = generateLevels({
        size: 9, count: 1, seed: `${seed}-${i}-${attempt}`, minPar: dailyMinPar(i), maxPar: 6, minSlack: 0, maxSlack: 4, maxTries: 200000,
      });
      total.tried += gen.stats.tried;
      for (const [k, v] of Object.entries(gen.stats.rejected)) total.rejected[k] = (total.rejected[k] ?? 0) + v;
      if (!gen.levels.length || boards.has(gen.levels[0].tiles.join('/'))) continue;
      level = gen.levels[0];
      total.kept++;
      if (gen.meta[0].usesTeleporter) total.usesTeleporter++;
    }
    if (!level) { log(`day ${i}: no level found, stopping at ${levels.length}`); break; }
    boards.add(level.tiles.join('/'));
    const { id, ...rest } = level; // drop the generator's temporary id
    levels.push({ id: `d-${addDays(start, i)}`, ...rest });
  }
  log(formatStats(total));
  return { id: 'daily', start, levels };
}

function main() {
  const argv = process.argv.slice(2);
  const here = dirname(fileURLToPath(import.meta.url));
  const opts = { ...DAILY_DEFAULTS };
  let out = resolve(here, '../assets/levels/daily.json');
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--days') opts.days = Number(argv[++i]);
    else if (a === '--start') opts.start = argv[++i];
    else if (a === '--seed') opts.seed = Number(argv[++i]);
    else if (a === '--out') out = resolve(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  const t0 = performance.now();
  const daily = buildDaily({ ...opts, log: (m) => console.log(m) });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(daily, null, 1) + '\n');
  const pars = {};
  for (const l of daily.levels) pars[l.par] = (pars[l.par] ?? 0) + 1;
  console.log(`${daily.levels.length} levels from ${daily.start} (${daily.levels[0].id} to ${daily.levels.at(-1).id}), par mix ${JSON.stringify(pars)}`);
  console.log(`built in ${((performance.now() - t0) / 1000).toFixed(1)}s, wrote ${out}`);
  if (daily.levels.length < opts.days) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
