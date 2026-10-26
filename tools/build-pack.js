// Builds assets/levels/pack-01.json (shipped to the site). Offline, deterministic.
//
//   node tools/build-pack.js [--out assets/levels/pack-01.json]
//
// Rules v4 everywhere (see docs/GAME_SPEC.md): every level stores "rules": "v4", wallBudget = par + 2,
// par, parAnswers (counted up to 50, a single par answer is NOT required) and one par answer ("answer").
//   1-5    hand-authored 7x7 tutorial, par 2-3, one idea each (tiles and answers below)
//   6-15   generated 7x7, par 3-4
//   16-25  generated 9x9, par 4-5
//   26-30  9x9 par 6-7: the two hardest Lab levels (lab-04 par 6, lab-05 par 7, re-id'd) + 3 generated at par 6
// Generated levels are ring-free (generator default). From each candidate pool we keep a balanced
// mix of par and teleporter use. Within each band the levels are ordered easiest first (par, then
// open-route length). Par 6 costs about 11 s per kept level to generate, so a full build takes a few minutes.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseLevel, solve, countAnswers, findPath, simulate, capViolation, cutsAllRoutes } from '../src/game/index.js';
import { generateLevels, formatStats } from './generate.js';

// One new idea each (rules v4: lines next to bridges and teleporters, and up to 2 sides of the robot
// and beacon, can be walled; you still can't cut every route, so every win is "out of moves").
// Each level carries its own hand-picked par answer, which must use the idea (tools/pack.test.js asserts it).
export const TUTORIAL = [
  // 1. Walls lengthen a route. Open grass along the top edge: the robot walks 6, and has 8. One wall
  //    isn't enough (it steps round it for 8), so a fence two lines tall across the corridor makes the
  //    way round 10.
  { tiles: [
      'R.....B',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
  ], moveLimit: 8, answer: [[2, 0, 'R'], [2, 1, 'R']] },
  // 2. Rocks do some of the blocking for you. Two lines between the rocks close the gap in the middle
  //    of the board, and the robot has to go the long way round.
  { tiles: [
      '..#B#..',
      '.......',
      '.#.....',
      '......#',
      '..##...',
      '..#..R.',
      '.......',
  ], moveLimit: 9, answer: [[4, 3, 'D'], [5, 3, 'D']] },
  // 3. A bridge: you CAN wall its ends now. Two lines on the near ends of the two close bridges leave
  //    only the far bridge, a long walk away.
  { tiles: [
      '...~...',
      '...~..B',
      '...=...',
      'R..=...',
      '...~...',
      '...~...',
      '...=...',
  ], moveLimit: 10, answer: [[2, 2, 'R'], [2, 3, 'R']] },
  // 4. A teleporter: you can wall right beside it. The pair in the top-left corner is the robot's
  //    shortcut; its two open sides are the only way in, so two lines seal it.
  { tiles: [
      'a......',
      '.......',
      '.R.....',
      '.......',
      '.......',
      '.....a.',
      '......B',
  ], moveLimit: 8, answer: [[0, 0, 'R'], [0, 0, 'D']] },
  // 5. Walls next to the robot or the beacon, at most 2 sides of each. Two lines on the beacon's left
  //    and bottom hold it back from the left and the bottom (a third side would be refused), and one
  //    more line finishes the job.
  { tiles: [
      '.#.....',
      '.......',
      '......B',
      '.......',
      '.......',
      '.R.....',
      '.......',
  ], moveLimit: 11, answer: [[5, 1, 'R'], [5, 2, 'R'], [6, 2, 'D']] },
];

/** [{par, slack: [lo, hi], count, tries, maxNodes}] sources for each generated band. */
const BANDS = [
  { size: 7, take: 10, quota: { 3: 5, 4: 5 }, sources: [
    { par: 3, slack: [3, 6], count: 20, tries: 4000, maxNodes: 200000 },
    { par: 4, slack: [4, 7], count: 20, tries: 4000, maxNodes: 200000 },
  ] },
  { size: 9, take: 10, quota: { 4: 5, 5: 5 }, sources: [
    { par: 4, slack: [4, 8], count: 20, tries: 4000, maxNodes: 300000 },
    { par: 5, slack: [6, 9], count: 14, tries: 4000, maxNodes: 300000 },
  ] },
  // 26-30: three generated par 6 (two Lab levels are added by buildPack)
  { size: 9, take: 3, quota: { 6: 3 }, sources: [
    { par: 6, slack: [8, 11], count: 6, tries: 3000, maxNodes: 600000 },
  ] },
];

const LAB_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/levels/lab.json');
const LAB_PICKS = ['lab-04', 'lab-05'];

function pick(items, take, quota) {
  // Take each par's quota in turn (a spread of par, not all the minimum). Within a par, greedy
  // diversity: each step takes the candidate whose teleporter use is least represented so far
  // (teleporter target 60%). If a par runs short, the remaining places go to whichever pars still
  // have candidates.
  items = items.slice();
  const chosen = [];
  const count = (f) => chosen.filter(f).length;
  const takeOne = (allowed) => {
    let best = -1, bestScore = Infinity;
    items.forEach((it, i) => {
      if (!allowed(it)) return;
      const score = it.usesTeleporter ? count((c) => c.usesTeleporter) / 0.6 : count((c) => !c.usesTeleporter) / 0.4;
      if (score < bestScore) { bestScore = score; best = i; }
    });
    if (best === -1) return false;
    chosen.push(items.splice(best, 1)[0]);
    return true;
  };
  const left = { ...quota };
  while (chosen.length < take && Object.values(left).some((n) => n > 0)) {
    let progressed = false;
    for (const par of Object.keys(left)) {
      if (left[par] > 0 && chosen.length < take) {
        left[par]--;
        if (takeOne((it) => it.level.par === Number(par))) progressed = true;
      }
    }
    if (!progressed) break;
  }
  while (chosen.length < take && takeOne(() => true));
  return chosen;
}

const byDifficulty = (a, b) => a.level.par - b.level.par || a.routeLength - b.routeLength;

export function buildPack(log = () => {}) {
  const entries = [];
  const boards = new Set();
  for (const t of TUTORIAL) {
    const lv = parseLevel({ size: 7, tiles: t.tiles, moveLimit: t.moveLimit, wallBudget: 200, rules: 'v4' });
    const s = solve(lv);
    const parAnswers = countAnswers(lv, s.par, 50);
    // the hand-picked answer must be a real par answer: right size, legal, leaves a route, wins
    const final = parseLevel({ size: 7, tiles: t.tiles, moveLimit: t.moveLimit, wallBudget: s.par + 2, rules: 'v4' });
    if (t.answer.length !== s.par || capViolation(final, t.answer) || cutsAllRoutes(final, t.answer) || simulate(final, t.answer).result !== 'win') {
      throw new Error(`tutorial answer ${JSON.stringify(t.answer)} is not a par answer (par ${s.par})`);
    }
    boards.add(t.tiles.join('/'));
    entries.push({ size: 7, tiles: t.tiles, rules: 'v4', moveLimit: t.moveLimit, wallBudget: s.par + 2, par: s.par, parAnswers, answer: t.answer });
  }
  const generated = [];
  BANDS.forEach((band, b) => {
    const items = [];
    for (const src of band.sources) {
      const t0 = performance.now();
      const gen = generateLevels({
        size: band.size, count: src.count, seed: `p01-b${b + 1}-par${src.par}`, minPar: src.par, maxPar: src.par,
        minSlack: src.slack[0], maxSlack: src.slack[1], maxTries: src.tries, maxNodes: src.maxNodes,
        rules: 'v4', unique: false, budgetExtra: 2, answerCap: 50,
      });
      log(`band ${b + 1}: ${band.size}x${band.size} par ${src.par}: ${gen.levels.length} candidates from ${gen.tried} tries in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
      log(formatStats(gen.stats));
      gen.levels.forEach((level, i) => {
        const key = level.tiles.join('/');
        if (boards.has(key)) return;
        boards.add(key);
        items.push({ level, ...gen.meta[i] });
      });
    }
    if (items.length < band.take) throw new Error(`band ${b + 1}: only ${items.length} levels, need ${band.take}`);
    generated.push(pick(items, band.take, band.quota));
  });

  // 26-30 also carries the two hardest Lab levels
  const lab = JSON.parse(readFileSync(LAB_FILE, 'utf8')).levels.filter((l) => LAB_PICKS.includes(l.id));
  if (lab.length !== LAB_PICKS.length) throw new Error('lab.json is missing lab-04 or lab-05');
  for (const l of lab) {
    const { id, ...rest } = l;
    const lv = parseLevel(l);
    generated[2].push({ level: rest, usesTeleporter: findPath(lv, []).teleports.length > 0, routeLength: findPath(lv, []).positions.length - 1 });
  }
  for (const group of generated) {
    for (const it of group.sort(byDifficulty)) {
      const { id, ...rest } = it.level;
      entries.push(rest);
    }
  }
  const levels = entries.map((e, i) => ({ id: `p01-${String(i + 1).padStart(2, '0')}`, ...e }));
  return { id: 'pack-01', levels };
}

function main() {
  const args = process.argv.slice(2);
  const here = dirname(fileURLToPath(import.meta.url));
  let out = resolve(here, '../assets/levels/pack-01.json');
  if (args[0] === '--out') out = resolve(args[1]);
  const t0 = performance.now();
  const pack = buildPack((m) => console.log(m));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(pack, null, 2) + '\n');
  pack.levels.forEach((l) => console.log(`${l.id} ${l.size}x${l.size} par ${l.par} parAnswers ${l.parAnswers}`));
  console.log(`built in ${((performance.now() - t0) / 1000).toFixed(1)}s, wrote ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
