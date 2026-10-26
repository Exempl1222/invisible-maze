import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from './level.js';
import { simulate } from './simulate.js';
import { solve, countAnswers } from './solve.js';
import { createRng } from './rng.js';
import { SPEC_LEVEL, SPEC_ANSWER, makeLevel } from './fixtures.test.js';

const keyOf = (ws) => ws.map(([x, y, d]) => `${x},${y},${d}`).sort().join('|');

test('spec example: par 5 with the documented answer, which leaves a long way round', () => {
  const lv = parseLevel(SPEC_LEVEL);
  const s = solve(lv);
  assert.equal(s.par, 5);
  assert.equal(keyOf(s.answer), keyOf(SPEC_ANSWER));
  const r = simulate(lv, s.answer);
  assert.equal(r.result, 'win');
  assert.equal(r.reason, 'too-far');
  assert.equal(countAnswers(lv, 5), 1);
  assert.equal(countAnswers(lv, 4), 0);
});

test('answers are canonical walls sorted by row, column, R before D', () => {
  const s = solve(parseLevel(SPEC_LEVEL));
  assert.deepEqual(s.answer, [[1, 4, 'R'], [2, 4, 'R'], [1, 5, 'R'], [2, 5, 'R'], [2, 6, 'R']]);
});

test('spec example solves in under 50ms', () => {
  const lv = parseLevel(SPEC_LEVEL);
  solve(lv); // warm up
  const t = performance.now();
  solve(lv);
  assert.ok(performance.now() - t < 50, `took ${performance.now() - t}ms`);
});

test('par 0 when the level is already a win; unsolvable levels give null', () => {
  const longWay = parseLevel(makeLevel(['R...B', '#####', '#####', '#####', '#####'], { moveLimit: 2 }));
  assert.deepEqual(solve(longWay), { par: 0, answer: [] });
  assert.equal(countAnswers(longWay, 0), 1);
  // beacon adjacent to the start: no line can be walled
  const hopeless = parseLevel(makeLevel(['RB', '..']));
  assert.equal(solve(hopeless), null);
  assert.equal(countAnswers(hopeless, 1), 0);
});

test('a level with no route at all is not a win (v3.1): solve gives null', () => {
  const walled = parseLevel(makeLevel(['R#B', '###', '###']));
  assert.equal(solve(walled), null);
  assert.equal(countAnswers(walled, 0), 0);
});

test('guarded lines make some levels unwinnable that tile walls could win', () => {
  // The only line on the corridor touches R or B, so nothing can be walled.
  const lv = parseLevel(makeLevel(['R.B', '###', '###'], { moveLimit: 5 }));
  assert.equal(solve(lv), null);
});

test('cutting the only route is never an answer: a corridor with no way round is unsolvable', () => {
  // R....B: every buildable line is a cut. Under v3 one wall won; under v3.1 nothing does.
  const lv = parseLevel(makeLevel(['R....B', '######', '######', '######', '######', '######'], { moveLimit: 10 }));
  assert.equal(solve(lv), null);
  for (let k = 0; k <= 3; k++) assert.equal(countAnswers(lv, k), 0, `k=${k}`);
});

test('a loop beside the corridor: the only winners lengthen the route, cutters are pruned', () => {
  // top lane R..B (lines 1|2, 2|3), bottom lane 8 moves longer. One top wall wins by detour.
  const lv = parseLevel(makeLevel(['R...B', '.###.', '.....', '#####', '#####'], { moveLimit: 6 }));
  const s = solve(lv);
  assert.equal(s.par, 1);
  assert.equal(countAnswers(lv, 1), 2);
  // two walls: the pairs that still leave a route (top + any bottom wall would cut it)
  const two = countAnswers(lv, 2, 1000);
  // 2 top walls ok (C(2,2)=1); 1 top + 1 bottom wall cuts both lanes; pairs inside the bottom lane
  // leave the top lane open (route 4 <= 6, lose). Only the two-top-walls set wins.
  assert.equal(two, 1);
});

test('maxPar bounds the search', () => {
  const lv = parseLevel(SPEC_LEVEL);
  assert.equal(solve(lv, { maxPar: 4 }), null);
  assert.equal(solve(lv, { maxPar: 5 }).par, 5);
});

test('countAnswers is capped and counts supersets of winners for k above par', () => {
  const open = parseLevel(makeLevel(['R....', '.....', '.....', '.....', '....B'], { moveLimit: 8 }));
  assert.equal(countAnswers(open, 6, 7), 7);
  assert.equal(countAnswers(open, 6), 50);
  const lv = parseLevel(makeLevel(['R...B', '.###.', '.....', '#####', '#####'], { moveLimit: 6 }));
  // 3 walls: the only lines off the bottom lane are the 2 top ones, so no 3-set keeps a route
  assert.equal(countAnswers(lv, 3, 1000), 0);
});

// ---------- property test against brute force ----------
// Everything below is independent of path.js, level.js and solve.js: its own line rules,
// its own BFS, its own combination search.

function randomLevel(rng, size) {
  const n = size * size;
  const cells = Array.from({ length: n }, () => {
    const r = rng.next();
    const rock = size === 5 ? 0.13 : 0.24;
    return r < rock ? '#' : r < rock + 0.07 ? '~' : r < rock + 0.12 ? '=' : '.';
  });
  const order = rng.shuffle([...Array(n).keys()]);
  cells[order[0]] = 'R';
  cells[order[1]] = 'B';
  if (rng.chance(0.6)) {
    cells[order[2]] = 'a';
    cells[order[3]] = 'a';
  }
  if (rng.chance(0.2)) {
    cells[order[4]] = 'b';
    cells[order[5]] = 'b';
  }
  const tiles = [];
  for (let y = 0; y < size; y++) tiles.push(cells.slice(y * size, y * size + size).join(''));
  return makeLevel(tiles, { moveLimit: rng.int(2, size + 5), wallBudget: 40 });
}

// Lines between two grass tiles ('.'), keyed "x,y,R" / "x,y,D". Independent definition.
function bruteLines(level) {
  const { size, tiles } = level;
  const out = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (tiles[y][x] !== '.') continue;
    if (x + 1 < size && tiles[y][x + 1] === '.') out.push(`${x},${y},R`);
    if (y + 1 < size && tiles[y + 1][x] === '.') out.push(`${x},${y},D`);
  }
  return out;
}

// Forward BFS: shortest move count from R to B, or null.
function bruteDist(level, walled) {
  const { size, tiles } = level;
  const partner = {};
  const seenLetters = {};
  let start, beacon;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = tiles[y][x];
    if (c >= 'a' && c <= 'z') (seenLetters[c] ??= []).push([x, y]);
    if (c === 'R') start = [x, y];
    if (c === 'B') beacon = [x, y];
  }
  for (const c of Object.keys(seenLetters)) {
    const [p, q] = seenLetters[c];
    partner[`${p}`] = q;
    partner[`${q}`] = p;
  }
  const lineKey = (x, y, nx, ny) => (nx > x ? `${x},${y},R` : nx < x ? `${nx},${ny},R` : ny > y ? `${x},${y},D` : `${nx},${ny},D`);
  const dist = new Map([[`${start}`, 0]]);
  const queue = [start];
  while (queue.length) {
    const [x, y] = queue.shift();
    const d = dist.get(`${[x, y]}`);
    if (x === beacon[0] && y === beacon[1]) return d;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      let nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const c = tiles[ny][nx];
      if (c === '#' || c === '~' || walled.has(lineKey(x, y, nx, ny))) continue;
      if (c >= 'a' && c <= 'z') [nx, ny] = partner[`${[nx, ny]}`];
      if (!dist.has(`${[nx, ny]}`)) {
        dist.set(`${[nx, ny]}`, d + 1);
        queue.push([nx, ny]);
      }
    }
  }
  return null;
}

function* combos(arr, k, from = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = from; i < arr.length; i++) {
    acc.push(arr[i]);
    yield* combos(arr, k, i + 1, acc);
    acc.pop();
  }
}

// The v3.1 rule, written out independently: a set wins only if a route exists AND it is longer
// than the move limit. Walls are no longer monotone (more walls can cut everything), so there is no
// "everything wins" shortcut. The search stops at MAX_K walls; a level whose par is above it counts as
// "null" on both sides (solve is called with the same maxPar).
const MAX_K = 4;

function bruteForce(level) {
  const lines = bruteLines(level);
  const wins = (set) => {
    const d = bruteDist(level, set);
    return d !== null && d > level.moveLimit;
  };
  // old rule (v3): a cut also won. Used only to prove the new rule changes some answers.
  const oldWins = (set) => {
    const d = bruteDist(level, set);
    return d === null || d > level.moveLimit;
  };
  let par = null, count = 0;
  for (let k = 0; k <= Math.min(MAX_K, lines.length) && par === null; k++) {
    for (const ws of combos(lines, k)) if (wins(new Set(ws))) count++;
    if (count > 0) par = k;
  }
  // Under the old rule a winner is also a winner now unless it cuts, so oldPar <= par.
  let oldPar = null;
  for (let k = 0; k <= (par ?? MAX_K) && oldPar === null; k++) {
    for (const ws of combos(lines, k)) if (oldWins(new Set(ws))) { oldPar = k; break; }
  }
  return par === null ? { none: true, oldPar } : { par, count, oldPar };
}

for (const size of [5, 6]) {
  test(`property: solve and countAnswers match brute force on 200 seeded ${size}x${size} levels`, () => {
    const rng = createRng(2026 + size);
    let solvable = 0, positivePar = 0, unique = 0, skipped = 0, maxPar = 0, ruleMatters = 0;
    for (let i = 0; i < 200; i++) {
      const raw = randomLevel(rng, size);
      if (bruteLines(raw).length > 20) { skipped++; continue; } // keep brute force fast
      const lv = parseLevel(raw);
      const expected = bruteForce(raw);
      const got = solve(lv, { maxPar: MAX_K });
      const ctx = `level ${i} (limit ${raw.moveLimit})\n${raw.tiles.join('\n')}`;
      if (expected.oldPar !== (expected.none ? null : expected.par)) ruleMatters++;
      if (expected.none) {
        assert.equal(got, null, `should be unsolvable, ${ctx}`);
        continue;
      }
      solvable++;
      if (expected.par > 0) positivePar++;
      if (expected.count === 1) unique++;
      maxPar = Math.max(maxPar, expected.par);
      assert.ok(got, ctx);
      assert.equal(got.par, expected.par, `par, ${ctx}`);
      assert.equal(got.answer.length, got.par);
      assert.equal(simulate(lv, got.answer).result, 'win', `answer wins, ${ctx}`);
      assert.equal(countAnswers(lv, got.par, 100000), expected.count, `count, ${ctx}`);
    }
    if (process.env.PROP_DEBUG) console.log({ size, solvable, positivePar, unique, skipped, maxPar, ruleMatters });
    // make sure the sample is not trivial
    assert.ok(skipped <= 100, `skipped ${skipped}`);
    assert.ok(solvable >= 25, `solvable ${solvable}`);
    assert.ok(positivePar >= 12, `par>0 ${positivePar}`);
    assert.ok(unique >= 3, `unique ${unique}`);
    assert.ok(maxPar >= 2, `max par ${maxPar}`);
    // the no-cut rule must actually change some answers in the sample, or the test proves nothing
    assert.ok(ruleMatters >= 10, `levels where cutting would have helped ${ruleMatters}`);
  });
}

// ---------- rules v4 property test ----------
// Independent of level.js / solve.js again: its own v4 line rule (both tiles walkable, inside
// the border), its own cap check (at most 2 walls touching R, at most 2 touching B) and the same
// brute-force search as above.

function randomLevelV4(rng, size) {
  const n = size * size;
  const cells = Array.from({ length: n }, () => {
    const r = rng.next();
    const rock = size === 5 ? 0.3 : 0.4;
    return r < rock ? '#' : r < rock + 0.08 ? '~' : r < rock + 0.13 ? '=' : '.';
  });
  const order = rng.shuffle([...Array(n).keys()]);
  cells[order[0]] = 'R';
  cells[order[1]] = 'B';
  if (rng.chance(0.5)) { cells[order[2]] = 'a'; cells[order[3]] = 'a'; }
  const tiles = [];
  for (let y = 0; y < size; y++) tiles.push(cells.slice(y * size, y * size + size).join(''));
  return makeLevel(tiles, { moveLimit: rng.int(2, size + 4), wallBudget: 40, rules: 'v4' });
}

function bruteLinesV4(level) {
  const { size, tiles } = level;
  const ok = (c) => c !== '#' && c !== '~';
  const out = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!ok(tiles[y][x])) continue;
    if (x + 1 < size && ok(tiles[y][x + 1])) out.push(`${x},${y},R`);
    if (y + 1 < size && ok(tiles[y + 1][x])) out.push(`${x},${y},D`);
  }
  return out;
}

function withinCap(level, set) {
  let start = 0, beacon = 0;
  for (const key of set) {
    const [x, y, d] = key.split(',');
    const a = [Number(x), Number(y)];
    const b = d === 'R' ? [a[0] + 1, a[1]] : [a[0], a[1] + 1];
    for (const [tx, ty] of [a, b]) {
      if (level.tiles[ty][tx] === 'R') start++;
      if (level.tiles[ty][tx] === 'B') beacon++;
    }
  }
  return start <= 2 && beacon <= 2;
}

function bruteForceV4(level, useCap) {
  const lines = bruteLinesV4(level);
  const wins = (set) => {
    if (useCap && !withinCap(level, set)) return false;
    const d = bruteDist(level, set);
    return d !== null && d > level.moveLimit;
  };
  for (let k = 0; k <= Math.min(MAX_K, lines.length); k++) {
    let count = 0;
    for (const ws of combos(lines, k)) if (wins(new Set(ws))) count++;
    if (count > 0) return { par: k, count };
  }
  return { none: true };
}

for (const size of [5, 6]) {
  test(`property (v4): solve and countAnswers match brute force, cap included, on 150 seeded ${size}x${size} levels`, () => {
    const rng = createRng(4040 + size);
    let solvable = 0, positivePar = 0, skipped = 0, capMatters = 0, noCutMatters = 0, newLineUsed = 0;
    for (let i = 0; i < 150; i++) {
      const raw = randomLevelV4(rng, size);
      if (bruteLinesV4(raw).length > 22) { skipped++; continue; }
      const lv = parseLevel(raw);
      const expected = bruteForceV4(raw, true);
      const uncapped = bruteForceV4(raw, false);
      const got = solve(lv, { maxPar: MAX_K });
      const ctx = `v4 level ${i} (limit ${raw.moveLimit})\n${raw.tiles.join('\n')}`;
      if (uncapped.none !== expected.none || uncapped.par !== expected.par || uncapped.count !== expected.count) capMatters++;
      if (expected.none) { assert.equal(got, null, `should be unsolvable, ${ctx}`); continue; }
      solvable++;
      if (expected.par > 0) positivePar++;
      assert.ok(got, ctx);
      assert.equal(got.par, expected.par, `par, ${ctx}`);
      assert.equal(simulate(lv, got.answer).result, 'win', `answer wins, ${ctx}`);
      assert.equal(countAnswers(lv, got.par, 100000), expected.count, `count, ${ctx}`);
      // counts one above par too (supersets, cap-pruned)
      if (expected.par + 1 <= MAX_K) {
        let brute = 0;
        for (const ws of combos(bruteLinesV4(raw), expected.par + 1)) {
          const set = new Set(ws);
          const d = withinCap(raw, set) ? bruteDist(raw, set) : null;
          if (d !== null && d > raw.moveLimit) brute++;
        }
        assert.equal(countAnswers(lv, expected.par + 1, 100000), brute, `count at par + 1, ${ctx}`);
      }
      if (got.answer.some(([x, y, d]) => [raw.tiles[y][x], d === 'R' ? raw.tiles[y][x + 1] : raw.tiles[y + 1][x]].some((c) => c !== '.'))) newLineUsed++;
    }
    if (process.env.PROP_DEBUG) console.log({ size, solvable, positivePar, skipped, capMatters, newLineUsed });
    assert.ok(skipped <= 90, `skipped ${skipped}`);
    assert.ok(solvable >= 15, `solvable ${solvable}`);
    assert.ok(positivePar >= 8, `par>0 ${positivePar}`);
    assert.ok(newLineUsed >= 4, `answers using a v4-only line ${newLineUsed}`);
    if (size === 5) assert.ok(capMatters >= 1, `levels where the cap changes the answer ${capMatters}`);
  });
}

test('v4: the cap prunes the search (three sides of the start is never an answer)', () => {
  // Start in the middle of open grass, beacon far; limit tight enough that boxing the start would be the cheap way.
  const lv = parseLevel(makeLevel(['.....', '.....', '..R..', '.....', '....B'], { rules: 'v4', moveLimit: 6 }));
  const s = solve(lv);
  if (s) {
    const near = s.answer.filter(([x, y, d]) => [[x, y], d === 'R' ? [x + 1, y] : [x, y + 1]].some(([a, b]) => a === 2 && b === 2));
    assert.ok(near.length <= 2);
  }
});
