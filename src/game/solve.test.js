import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from './level.js';
import { simulate } from './simulate.js';
import { solve, countAnswers } from './solve.js';
import { createRng } from './rng.js';
import { SPEC_LEVEL, SPEC_ANSWER, makeLevel } from './fixtures.test.js';

const keyOf = (ws) => ws.map(([x, y, d]) => `${x},${y},${d}`).sort().join('|');

test('spec example: par 3 with the documented answer', () => {
  const lv = parseLevel(SPEC_LEVEL);
  const s = solve(lv);
  assert.equal(s.par, 3);
  assert.equal(keyOf(s.answer), keyOf(SPEC_ANSWER));
  assert.equal(simulate(lv, s.answer).result, 'win');
  assert.equal(countAnswers(lv, 3), 1);
  assert.equal(countAnswers(lv, 2), 0);
});

test('answers are canonical walls sorted by row, column, R before D', () => {
  const s = solve(parseLevel(SPEC_LEVEL));
  assert.deepEqual(s.answer, [[1, 4, 'R'], [2, 4, 'R'], [2, 4, 'D']]);
});

test('spec example solves in under 50ms', () => {
  const lv = parseLevel(SPEC_LEVEL);
  solve(lv); // warm up
  const t = performance.now();
  solve(lv);
  assert.ok(performance.now() - t < 50, `took ${performance.now() - t}ms`);
});

test('par 0 when the level is already a win; unsolvable levels give null', () => {
  const walled = parseLevel(makeLevel(['R#B', '###', '###']));
  assert.deepEqual(solve(walled), { par: 0, answer: [] });
  assert.equal(countAnswers(walled, 0), 1);
  // beacon adjacent to the start: no line can be walled
  const hopeless = parseLevel(makeLevel(['RB', '..']));
  assert.equal(solve(hopeless), null);
  assert.equal(countAnswers(hopeless, 1), 0);
});

test('guarded lines make some levels unwinnable that tile walls could win', () => {
  // The only line on the corridor touches R or B, so nothing can be walled.
  const lv = parseLevel(makeLevel(['R.B', '###', '###'], { moveLimit: 5 }));
  assert.equal(solve(lv), null);
});

test('maxPar bounds the search', () => {
  const lv = parseLevel(SPEC_LEVEL);
  assert.equal(solve(lv, { maxPar: 2 }), null);
  assert.equal(solve(lv, { maxPar: 3 }).par, 3);
});

test('countAnswers is capped and counts supersets of winners for k above par', () => {
  // corridor R....B: lines 1|2, 2|3, 3|4 are buildable, one wall anywhere wins
  const lv = parseLevel(makeLevel(['R....B', '######', '######', '######', '######', '######'], { moveLimit: 10 }));
  assert.equal(solve(lv).par, 1);
  assert.equal(countAnswers(lv, 1), 3);
  assert.equal(countAnswers(lv, 2), 3); // C(3,2)
  assert.equal(countAnswers(lv, 3), 1);
  assert.equal(countAnswers(lv, 4), 0);
  const open = parseLevel(makeLevel(['R....', '.....', '.....', '.....', '....B'], { moveLimit: 8 }));
  assert.equal(countAnswers(open, 6, 7), 7);
  assert.equal(countAnswers(open, 6), 50);
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

function bruteForce(level) {
  const lines = bruteLines(level);
  const wins = (set) => {
    const d = bruteDist(level, set);
    return d === null || d > level.moveLimit;
  };
  if (!wins(new Set(lines))) return null; // walls only ever help, so nothing wins
  for (let k = 0; k <= lines.length; k++) {
    let count = 0;
    for (const ws of combos(lines, k)) if (wins(new Set(ws))) count++;
    if (count > 0) return { par: k, count };
  }
  return null;
}

for (const size of [5, 6]) {
  test(`property: solve and countAnswers match brute force on 200 seeded ${size}x${size} levels`, () => {
    const rng = createRng(2026 + size);
    let solvable = 0, positivePar = 0, unique = 0, skipped = 0, maxPar = 0;
    for (let i = 0; i < 200; i++) {
      const raw = randomLevel(rng, size);
      if (bruteLines(raw).length > 22) { skipped++; continue; } // keep brute force fast
      const lv = parseLevel(raw);
      const expected = bruteForce(raw);
      const got = solve(lv);
      const ctx = `level ${i} (limit ${raw.moveLimit})\n${raw.tiles.join('\n')}`;
      if (expected === null) {
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
    // make sure the sample is not trivial
    assert.ok(skipped <= 100, `skipped ${skipped}`);
    assert.ok(solvable >= 50, `solvable ${solvable}`);
    assert.ok(positivePar >= 25, `par>0 ${positivePar}`);
    assert.ok(unique >= 3, `unique ${unique}`);
    assert.ok(maxPar >= 2, `max par ${maxPar}`);
  });
}
