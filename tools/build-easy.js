// Builds assets/levels/easy.json: the 20 Easy 5x5 levels (docs/GAME_SPEC.md "Rules v5", Tiers; docs/PLAY_PLAN.md "Easy").
//
//   node tools/build-easy.js
//
// Rules v4 only, budget = par + 2, deterministic from fixed seeds. Levels 1-5 are pack 1's hand-authored tutorial
// (TUTORIAL in tools/build-pack.js). 6-20 are generated here, easiest first in each group:
//   6-9    par 2, rocks only        10-13  par 2-3, river and bridges    14-17  par 3, a teleporter pair
//   18-20  par 3-4, mixes (river, bridges and a teleporter); level 20 is par 4
// Metrics enforced (throws): par as above, slack 2-5, parAnswers <= 10 on 6-13, the river and bridges (10-13, the
// answer must also fence a bridge end) or the teleporter pair (14-17) load-bearing for the stored answer, valid bridges, no duplicate boards.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseLevel, findPath, solve, countAnswers, simulate, cutsAllRoutes, createRng } from '../src/game/index.js';
import { invalidBridges } from './generate.js';
import { TUTORIAL } from './build-pack.js';

const SIZE = 5;
// kind: rocks | bridge | tele | mix. pars: the par of each wanted level, in order.
const GROUPS = [
  { kind: 'rocks', pars: [2, 2, 2, 2], parAnswersMax: 10 },
  { kind: 'bridge', pars: [2, 2, 3, 3], parAnswersMax: 10 },
  { kind: 'tele', pars: [3, 3, 3, 3] },
  { kind: 'mix', pars: [3, 3, 4] },
];

function terrain(rng, kind) {
  const g = Array.from({ length: SIZE }, () => Array(SIZE).fill('.'));
  const cells = () => g.flatMap((row, y) => row.map((c, x) => (c === '.' ? [x, y] : null)).filter(Boolean));
  const river = kind === 'bridge' || kind === 'mix';
  if (river) { // a straight river down column c with 1 or 2 bridges; the board is turned at the end
    const c = rng.int(1, 3);
    const bridges = rng.shuffle([0, 1, 2, 3, 4]).slice(0, rng.int(1, 2));
    for (let y = 0; y < SIZE; y++) g[y][c] = bridges.includes(y) ? '=' : '~';
    const rocks = rng.int(0, 3);
    for (let i = 0; i < rocks; i++) { const [x, y] = rng.pick(cells()); if (x !== c) g[y][x] = '#'; }
    const left = cells().filter(([x]) => x < c), right = cells().filter(([x]) => x > c);
    if (!left.length || !right.length) return null;
    const [a, b] = [rng.pick(left), rng.pick(right)];
    g[a[1]][a[0]] = 'R';
    g[b[1]][b[0]] = 'B';
  } else {
    const rocks = kind === 'rocks' ? rng.int(3, 7) : rng.int(0, 3);
    for (let i = 0; i < rocks; i++) { const [x, y] = rng.pick(cells()); g[y][x] = '#'; }
    const [a, b] = rng.shuffle(cells());
    g[a[1]][a[0]] = 'R';
    g[b[1]][b[0]] = 'B';
  }
  if (kind === 'tele' || kind === 'mix') {
    const free = cells();
    if (free.length < 2) return null;
    const [a, b] = rng.shuffle(free);
    g[a[1]][a[0]] = 'a';
    g[b[1]][b[0]] = 'a';
  }
  let out = g;
  if (rng.chance(0.5)) out = out[0].map((_, x) => out.map((row) => row[x]));
  if (rng.chance(0.5)) out = out.map((row) => row.slice().reverse());
  if (rng.chance(0.5)) out = out.slice().reverse();
  const rows = out.map((row) => row.join(''));
  return invalidBridges(rows).length === 0 ? rows : null;
}

/** Does `answer` still win if `tiles` are swapped for these? (the load-bearing test) */
function winsOn(level, tiles, answer) {
  const lv = parseLevel({ ...level, tiles });
  return !cutsAllRoutes(lv, answer) && simulate(lv, answer).result === 'win';
}

export /** A bridge is walkable like grass, so "bridges become grass" changes nothing; the river is what makes them choke points. */
const touchesBridge = (lv, answer) => answer.some(([x, y, d]) => lv.tile(x, y) === '=' || lv.tile(d === 'R' ? x + 1 : x, d === 'D' ? y + 1 : y) === '=');

function candidate(kind, seed, i, wantPar, parAnswersMax) {
  const rng = createRng(`${seed}:${i}`);
  const tiles = terrain(rng, kind);
  if (!tiles) return null;
  const probe = parseLevel({ size: SIZE, tiles, moveLimit: 1, wallBudget: 0, rules: 'v4' });
  const open = findPath(probe, []);
  if (!open) return null;
  const route = open.positions.length - 1;
  if (route < SIZE) return null;
  const moveLimit = route + rng.int(2, 5);
  const lv = parseLevel({ size: SIZE, tiles, moveLimit, wallBudget: SIZE * SIZE * 2, rules: 'v4' });
  const s = solve(lv, { maxPar: wantPar, maxNodes: 200000 });
  if (!s || s.par !== wantPar) return null;
  const parAnswers = countAnswers(lv, s.par, 50);
  if (parAnswersMax && parAnswers > parAnswersMax) return null;
  const level = { size: SIZE, tiles, rules: 'v4', moveLimit, wallBudget: s.par + 2, par: s.par, parAnswers, answer: s.answer };
  if (kind === 'bridge' && (winsOn(level, tiles.map((r) => r.replace(/[~=]/g, '.')), s.answer) || !touchesBridge(lv, s.answer))) return null;
  if (kind === 'tele' && winsOn(level, tiles.map((r) => r.replace(/[a-z]/g, '.')), s.answer)) return null;
  return { level, route };
}

/** Throws unless the levels meet the Easy design metrics. */
export function checkEasy(levels) {
  const seen = new Set();
  levels.forEach((l, i) => {
    const n = i + 1;
    if (l.wallBudget !== l.par + 2) throw new Error(`easy ${n}: budget`);
    if (invalidBridges(l.tiles).length) throw new Error(`easy ${n}: bridge does not span a river`);
    if (seen.has(l.tiles.join('/'))) throw new Error(`easy ${n}: duplicate board`);
    seen.add(l.tiles.join('/'));
    if (n > 5) {
      const slack = l.moveLimit - (findPath(parseLevel(l), []).positions.length - 1);
      if (slack < 2 || slack > 5) throw new Error(`easy ${n}: slack ${slack}`);
      if (n <= 13 && l.parAnswers > 10) throw new Error(`easy ${n}: ${l.parAnswers} par answers`);
    }
  });
}

export function buildEasy() {
  const entries = [];
  for (const t of TUTORIAL) {
    const lv = parseLevel({ size: SIZE, tiles: t.tiles, moveLimit: t.moveLimit, wallBudget: 200, rules: 'v4' });
    const par = solve(lv).par;
    entries.push({ size: SIZE, tiles: t.tiles, rules: 'v4', moveLimit: t.moveLimit, wallBudget: par + 2, par, parAnswers: countAnswers(lv, par, 50), answer: t.answer });
  }
  const used = new Set(entries.map((e) => e.tiles.join('/')));
  GROUPS.forEach((g, gi) => {
    const group = [];
    for (const par of [...new Set(g.pars)]) {
      const want = g.pars.filter((p) => p === par).length;
      let got = 0;
      for (let i = 0; got < want; i++) {
        if (i > 20000) throw new Error(`easy group ${gi + 1}: not enough par ${par} candidates`);
        const c = candidate(g.kind, `easy-g${gi + 1}-par${par}`, i, par, g.parAnswersMax);
        if (!c || used.has(c.level.tiles.join('/'))) continue;
        used.add(c.level.tiles.join('/'));
        group.push(c);
        got++;
      }
    }
    group.sort((a, b) => a.level.par - b.level.par || a.route - b.route);
    entries.push(...group.map((c) => c.level));
  });
  const levels = entries.map((e, i) => ({ id: `easy-${String(i + 1).padStart(2, '0')}`, ...e }));
  checkEasy(levels);
  return { id: 'easy', levels };
}

function main() {
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/levels/easy.json');
  const pack = buildEasy();
  writeFileSync(out, JSON.stringify(pack, null, 2) + '\n');
  pack.levels.forEach((l) => console.log(`${l.id} par ${l.par} parAnswers ${l.parAnswers} slack ${l.moveLimit - (findPath(parseLevel(l), []).positions.length - 1)}`));
  console.log(`wrote ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
