import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from './level.js';
import { simulate } from './simulate.js';
import { solve, countAnswers } from './solve.js';
import { createRng } from './rng.js';
import { SPEC_LEVEL, SPEC_ANSWER, makeLevel } from './fixtures.test.js';

const keyOf = (ws) => ws.map(([x, y]) => `${x},${y}`).sort().join('|');

test('spec example: par 3 with the documented answer', () => {
  const lv = parseLevel(SPEC_LEVEL);
  const s = solve(lv);
  assert.equal(s.par, 3);
  assert.equal(keyOf(s.answer), keyOf(SPEC_ANSWER));
  assert.equal(simulate(lv, s.answer).result, 'win');
  assert.equal(countAnswers(lv, 3), 1);
  assert.equal(countAnswers(lv, 2), 0);
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
  // beacon adjacent to the start: no wall can help
  const hopeless = parseLevel(makeLevel(['RB', '..']));
  assert.equal(solve(hopeless), null);
  assert.equal(countAnswers(hopeless, 1), 0);
});

test('maxPar bounds the search', () => {
  const lv = parseLevel(SPEC_LEVEL);
  assert.equal(solve(lv, { maxPar: 2 }), null);
  assert.equal(solve(lv, { maxPar: 3 }).par, 3);
});

test('countAnswers is capped and counts supersets of winners for k above par', () => {
  // corridor R . . . B, limit 10: one wall anywhere on the 3 grass cells wins
  const lv = parseLevel(makeLevel(['R...B', '#####', '#####', '#####', '#####'], { moveLimit: 10 }));
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

function randomLevel(rng) {
  const size = 5;
  const n = size * size;
  const cells = Array.from({ length: n }, () => {
    const r = rng.next();
    return r < 0.16 ? '#' : r < 0.26 ? '~' : r < 0.31 ? '=' : '.';
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
  return makeLevel(tiles, { moveLimit: rng.int(1, 9), wallBudget: 10 });
}

// Independent forward BFS (does not use path.js): returns shortest move count or null.
function bruteDist(level, wallSet) {
  const { size } = level;
  const t = (x, y) => level.tiles[y][x];
  const partner = {};
  const seen = {};
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = t(x, y);
    if (c >= 'a' && c <= 'z') (seen[c] ??= []).push([x, y]);
  }
  for (const c of Object.keys(seen)) {
    const [p, q] = seen[c];
    partner[`${p}`] = q;
    partner[`${q}`] = p;
  }
  let start, beacon;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (t(x, y) === 'R') start = [x, y];
    if (t(x, y) === 'B') beacon = [x, y];
  }
  const dist = new Map([[`${start}`, 0]]);
  const queue = [start];
  while (queue.length) {
    const [x, y] = queue.shift();
    const d = dist.get(`${[x, y]}`);
    if (x === beacon[0] && y === beacon[1]) return d;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      let nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const c = t(nx, ny);
      if (c === '#' || c === '~' || wallSet.has(`${nx},${ny}`)) continue;
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
  const grass = [];
  level.tiles.forEach((row, y) => [...row].forEach((c, x) => { if (c === '.') grass.push([x, y]); }));
  for (let k = 0; k <= grass.length; k++) {
    let count = 0;
    for (const ws of combos(grass, k)) {
      const d = bruteDist(level, new Set(ws.map(([x, y]) => `${x},${y}`)));
      if (d === null || d > level.moveLimit) count++;
    }
    if (count > 0) return { par: k, count };
  }
  return null;
}

test('property: solve and countAnswers match brute force on 200 seeded 5x5 levels', () => {
  const rng = createRng(2026);
  let solvable = 0, positivePar = 0, unique = 0;
  for (let i = 0; i < 200; i++) {
    const raw = randomLevel(rng);
    const lv = parseLevel(raw);
    const expected = bruteForce(raw);
    const got = solve(lv);
    if (expected === null) {
      assert.equal(got, null, `level ${i} should be unsolvable\n${raw.tiles.join('\n')}`);
      continue;
    }
    solvable++;
    if (expected.par > 0) positivePar++;
    if (expected.count === 1) unique++;
    assert.ok(got, `level ${i}`);
    assert.equal(got.par, expected.par, `par, level ${i} (limit ${raw.moveLimit})\n${raw.tiles.join('\n')}`);
    assert.equal(got.answer.length, got.par);
    assert.equal(simulate(lv, got.answer).result, 'win', `answer wins, level ${i}`);
    assert.equal(countAnswers(lv, got.par, 1000), expected.count, `count, level ${i}`);
  }
  // make sure the sample is not trivial
  assert.ok(solvable >= 100, `solvable ${solvable}`);
  assert.ok(positivePar >= 40, `par>0 ${positivePar}`);
  assert.ok(unique >= 5, `unique ${unique}`);
});
