// Rules v5 (ice, mud, gates): one test per spec sentence. Spec: docs/GAME_SPEC.md "Rules v5".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel, buildableLines, capViolation } from './level.js';
import { findPath } from './path.js';
import { simulate, cutsAllRoutes } from './simulate.js';
import { solve, countAnswers } from './solve.js';
import { makeLevel } from './fixtures.test.js';

/** A square v5 board from rows. */
function v5(tiles, extra = {}) {
  return parseLevel(makeLevel(tiles, { rules: 'v5', ...extra }));
}

/** A 5x5 board with `row` on y = 2 and rocks everywhere else. */
function strip(row, extra = {}) {
  const wall = '#####';
  return v5([wall, wall, row, wall, wall], extra);
}

const pos = (route) => route.positions.map(([x, y]) => `${x},${y}`).join(' ');
const moves = (route) => route.positions.length - 1;

// ---------------------------------------------------------------- parsing

test('v5 is a known rule set and accepts ice, mud and gates', () => {
  const lv = v5(['R*&..', '.>...', '.....', '..^v.', '....B']);
  assert.equal(lv.rules, 'v5');
  assert.equal(lv.tile(1, 0), '*');
  assert.equal(lv.tile(2, 0), '&');
  assert.equal(lv.tile(1, 1), '>');
  assert.equal(lv.tile(2, 3), '^');
  assert.equal(lv.tile(3, 3), 'v');
  for (const [x, y] of [[1, 0], [2, 0], [1, 1], [2, 3], [3, 3]]) assert.equal(lv.walkable(x, y), true);
});

test('in v5 the letter v is a gate, not a teleporter letter', () => {
  const lv = v5(['R....', '.....', '.....', '..v..', '....B']);
  assert.equal(lv.partner(2, 3), null);
  const t = v5(['R...a', '.....', '.....', '.....', 'a...B']); // other letters still pair up
  assert.deepEqual(t.partner(4, 0), [0, 4]);
});

test('v5 symbols on a level that is not v5 throw a clear error', () => {
  for (const sym of ['*', '&', '>', '<', '^']) {
    for (const rules of [undefined, 'v3.1', 'v4']) {
      const tiles = ['R....', `.${sym}...`, '.....', '.....', '....B'];
      const extra = rules === undefined ? {} : { rules };
      assert.throws(() => parseLevel(makeLevel(tiles, extra)), /rules v5/, `${sym} under ${rules}`);
    }
  }
  // 'v' stays a teleporter letter outside v5: once is an error, twice is a pair
  assert.throws(() => parseLevel(makeLevel(['R....', '.v...', '.....', '.....', '....B'], { rules: 'v4' })), /teleporter 'v'/);
  assert.ok(parseLevel(makeLevel(['Rv...', '.....', '.....', '.....', 'v...B'], { rules: 'v4' })).partner(1, 0));
});

test('the tool field is rejected (the engine does not support tools yet), on every rule set', () => {
  const tiles = ['R....', '.....', '.....', '.....', '....B'];
  assert.throws(() => parseLevel(makeLevel(tiles, { rules: 'v5', tool: 'ladder' })), /tool/);
  assert.throws(() => parseLevel(makeLevel(tiles, { rules: 'v4', tool: 'ladder' })), /tool/);
  assert.throws(() => parseLevel(makeLevel(tiles, { tool: 'ladder' })), /tool/);
});

test('a gate needs walkable land that is not a gate on both ends of its arrow, on the board', () => {
  // valid: grass, ice, mud, the start and the house at the ends
  assert.ok(v5(['R>...', '.....', '.....', '.....', '....B']));
  assert.ok(v5(['.R...', '.*...', '.&...', '.v...', '.*..B']));
  assert.ok(v5(['##B##', '##^##', '##R##', '.....', '.....']));
  // exit off the board, or entry off the board, all four arrows
  assert.throws(() => v5(['R...>', '.....', '.....', '.....', '....B']), /gate/);
  assert.throws(() => v5(['R....', '.....', '.....', '.....', '<...B']), /gate/);
  assert.throws(() => v5(['R.^..', '.....', '.....', '.....', '....B']), /gate/);
  assert.throws(() => v5(['R....', '.....', '.....', '.....', '..v.B']), /gate/);
  assert.throws(() => v5(['R....', '.....', '>....', '.....', '....B']), /gate/);
  assert.throws(() => v5(['R....', '.....', '....<', '.....', '....B']), /gate/);
  // exit or entry is rock or river
  assert.throws(() => v5(['R>#..', '.....', '.....', '.....', '....B']), /gate/);
  assert.throws(() => v5(['R#<..', '.....', '.....', '.....', '....B']), /gate/);
  assert.throws(() => v5(['R....', '.~...', '.^...', '.....', '....B']), /gate/);
  assert.throws(() => v5(['R....', '.....', '.v...', '.#...', '....B']), /gate/);
  // another gate on either end
  assert.throws(() => v5(['R>>..', '.....', '.....', '.....', '....B']), /gate/);
  assert.throws(() => v5(['R....', '.>>..', '.....', '.....', '....B']), /gate/);
  assert.throws(() => v5(['R....', '..^..', '..^..', '.....', '....B']), /gate/);
});

test('v5 lines: ice, mud and gates can be fenced when the other side is walkable', () => {
  const lv = v5(['R*&..', '.>...', '.....', '.....', '....B']);
  assert.equal(lv.lineBuildable(0, 0, 'R'), true); // start | ice
  assert.equal(lv.lineBuildable(1, 0, 'R'), true); // ice | mud
  assert.equal(lv.lineBuildable(1, 0, 'D'), true); // ice | gate
  assert.equal(lv.lineBuildable(4, 0, 'R'), false); // border
  assert.deepEqual(buildableLines(strip('R*#.B')), [[0, 2, 'R'], [3, 2, 'R']]); // ice | rock is not fenceable
});

test('the v4 side cap holds under v5', () => {
  const lv = v5(['.....', '.....', '..R..', '.....', '....B']);
  assert.equal(capViolation(lv, [[1, 2, 'R'], [2, 2, 'R']]), null);
  assert.equal(capViolation(lv, [[1, 2, 'R'], [2, 2, 'R'], [2, 1, 'D']]), 'start');
});

// ---------------------------------------------------------------- ice

test('a move onto ice slides on to the first tile that is not ice; the whole slide is one move', () => {
  const r = findPath(strip('R**.B'), []);
  assert.equal(pos(r), '0,2 3,2 4,2');
  assert.equal(moves(r), 2);
  assert.deepEqual(r.trails[0], []);
  assert.deepEqual(r.trails[1], [[1, 2], [2, 2], [3, 2]]); // the tiles the slide passes; the last is where he stops
  assert.deepEqual(r.trails[2], [[4, 2]]);
  assert.deepEqual(r.stuck, []);
  assert.deepEqual(r.teleports, []);
  assert.equal(moves(findPath(strip('R...B'), [])), 4); // the same row without ice
});

test('a slide stops on the ice before a rock or a river, and at the border', () => {
  assert.equal(findPath(strip('R**#B'), []), null);
  assert.equal(findPath(strip('R**~B'), []), null);
  const lv = v5(['#####', '####B', '#R***', '#####', '#####']);
  const r = findPath(lv, []);
  assert.equal(pos(r), '1,2 4,2 4,1'); // slides to the border tile, then a normal step up
});

test('a fence on any line the slide crosses stops him on the ice before it', () => {
  // Row 1 is open grass, so a fence never cuts the board here.
  const lv = v5(['#####', '.....', 'R**.B', '#####', '#####']);
  assert.equal(pos(findPath(lv, [])), '0,2 3,2 4,2');
  const r = findPath(lv, [[2, 2, 'R']]); // fence between the second ice tile and the grass
  assert.equal(pos(r).slice(0, 7), '0,2 2,2'); // he slides onto the ice, stops before the fence, goes round
  assert.deepEqual(r.trails[1], [[1, 2], [2, 2]]);
  assert.equal(moves(r), 5);
  assert.equal(moves(findPath(lv, [[1, 2, 'R']])), 6); // fence between the two ice tiles: he stops on the first
  assert.equal(moves(findPath(lv, [[0, 2, 'R']])), 5); // fence at the start: up, over, down onto the ice and slide
  assert.equal(moves(findPath(lv, [[3, 2, 'R']])), 4); // fence before the house: round by row 1
  // in a corridor every fence cuts the board
  assert.ok(cutsAllRoutes(strip('R**.B'), [[0, 2, 'R']]));
  assert.ok(cutsAllRoutes(strip('R**.B'), [[1, 2, 'R']]));
  assert.ok(!cutsAllRoutes(lv, [[1, 2, 'R']]));
});

test('a fence can open a route: stopping on the ice lets him turn', () => {
  // Free: he slides to (3,2); stepping back left slides him all the way to the start. The house
  // sits above the middle ice tile, so only a fence that stops him there gets him home.
  const lv = v5(['#####', '##B##', 'R***#', '#####', '#####']);
  assert.equal(findPath(lv, []), null);
  assert.equal(cutsAllRoutes(lv, []), true);
  const r = findPath(lv, [[2, 2, 'R']]);
  assert.equal(pos(r), '0,2 2,2 2,1');
  assert.equal(moves(r), 2);
});

test('a fence can shorten the route: stopping early beats sliding past', () => {
  const lv = v5(['#####', '##B..', 'R***.', '#####', '#####']);
  assert.equal(moves(findPath(lv, [])), 4); // slide to (4,2), up, left, left
  assert.equal(moves(findPath(lv, [[2, 2, 'R']])), 2); // stop under the house, step up
});

test('a slide onto mud stops there and adds the mud move', () => {
  const r = findPath(strip('R*&.B'), []);
  assert.equal(pos(r), '0,2 2,2 2,2 3,2 4,2');
  assert.deepEqual(r.stuck, [2]); // move 2 is the stuck move
  assert.deepEqual(r.trails[1], [[1, 2], [2, 2]]);
  assert.deepEqual(r.trails[2], []);
  assert.equal(moves(r), 4);
});

test('a slide onto a teleporter jumps him and ends the slide', () => {
  const lv = v5(['#####', '#####', 'R*a##', '####a', '####B']);
  const r = findPath(lv, []);
  assert.equal(pos(r), '0,2 4,3 4,4'); // he does not slide on out of the partner tile
  assert.deepEqual(r.teleports, [1]);
  assert.deepEqual(r.via, [null, [2, 2], null]);
  assert.deepEqual(r.trails[1], [[1, 2], [2, 2]]);
});

test('a slide onto the house reaches it', () => {
  const r = findPath(strip('R**B#'), []);
  assert.equal(pos(r), '0,2 3,2');
  assert.equal(moves(r), 1);
});

test('a slide onto a gate it may enter stops on the gate; a gate that refuses entry stops him before it', () => {
  const open = findPath(strip('R*>.B'), []);
  assert.equal(pos(open), '0,2 2,2 3,2 4,2'); // stops on the gate, then walks on along the arrow
  assert.deepEqual(open.trails[1], [[1, 2], [2, 2]]);
  assert.equal(findPath(strip('R*<.B'), []), null); // < refuses a move to the right: he stays on the ice
});

test('a move that starts on ice is a normal step in any direction; landing on ice starts a new slide', () => {
  const lv = v5(['#*B##', '#*###', 'R*###', '#####', '#####']);
  const r = findPath(lv, []);
  assert.equal(pos(r), '0,2 1,2 1,0 2,0'); // stops on (1,2) at the rock, steps up, slides to the border, steps right
  assert.deepEqual(r.trails[2], [[1, 1], [1, 0]]);
});

// ---------------------------------------------------------------- mud

test('stepping onto mud costs 2 moves: 1 to step in, 1 stuck; stepping off is a normal move', () => {
  const r = findPath(strip('R&..B'), []);
  assert.equal(pos(r), '0,2 1,2 1,2 2,2 3,2 4,2');
  assert.deepEqual(r.stuck, [2]);
  assert.equal(moves(r), 5);
});

test('mud next to the house: the stuck move is still part of the route', () => {
  const r = findPath(strip('R.&B#'), []);
  assert.equal(moves(r), 4); // step, into the mud, stuck, onto the house
  assert.deepEqual(r.stuck, [3]);
  assert.equal(pos(r), '0,2 1,2 2,2 2,2 3,2');
});

test('routing goes round mud when that is cheaper', () => {
  const lv = v5(['#####', '.....', 'R&&&B', '#####', '#####']);
  const r = findPath(lv, []);
  assert.equal(moves(r), 6); // up, four along, down; the mud route costs 7
  assert.deepEqual(r.stuck, []);
});

// ---------------------------------------------------------------- gates

test('a gate can only be entered and left along its arrow', () => {
  assert.equal(pos(findPath(strip('R>..B'), [])), '0,2 1,2 2,2 3,2 4,2');
  assert.equal(findPath(strip('R<..B'), []), null); // < refuses a move to the right
  assert.equal(pos(findPath(strip('B.<.R'), [])), '4,2 3,2 2,2 1,2 0,2');
  assert.equal(findPath(strip('B.>.R'), []), null); // > refuses a move to the left
  assert.equal(pos(findPath(v5(['..B..', '..^..', '..R..', '#####', '#####']), [])), '2,2 2,1 2,0');
  assert.equal(findPath(v5(['##R##', '##^##', '##B##', '#####', '#####']), []), null);
  assert.equal(pos(findPath(v5(['##R##', '##v##', '##B##', '#####', '#####']), [])), '2,0 2,1 2,2');
  assert.equal(findPath(v5(['##B##', '##v##', '##R##', '#####', '#####']), []), null);
});

test('he cannot step sideways off a gate', () => {
  // ^ gate at (2,2), start below it, house to the gate's left. Free: straight left then up (2 moves).
  const lv = v5(['.....', '.....', '.B^..', '..R..', '.....']);
  assert.equal(moves(findPath(lv, [])), 2);
  // Fence the start in on three sides: he must go up through the gate and round it.
  const r = findPath(lv, [[1, 3, 'R'], [2, 3, 'R'], [2, 3, 'D']]);
  assert.equal(pos(r), '2,3 2,2 2,1 1,1 1,2');
});

test('a fence across a gate line still blocks it', () => {
  assert.equal(findPath(strip('R>..B'), [[0, 2, 'R']]), null);
  assert.equal(findPath(strip('R>..B'), [[1, 2, 'R']]), null);
});

// ---------------------------------------------------------------- simulate

test('simulate: win when the cheapest route costs more than the limit; he walks until the moves run out', () => {
  const lv = strip('R&..B', { moveLimit: 4, wallBudget: 2 });
  const r = simulate(lv, []);
  assert.equal(r.result, 'win');
  assert.equal(r.reason, 'too-far');
  assert.equal(r.movesUsed, 4);
  assert.deepEqual(r.steps, [[0, 2], [1, 2], [1, 2], [2, 2], [3, 2]]);
  assert.deepEqual(r.stuck, [2]);
  assert.deepEqual(r.trails, [[], [[1, 2]], [], [[2, 2]], [[3, 2]]]);
});

test('simulate: his moves can run out while he is stuck in mud, or just after stepping in', () => {
  const stuckIn = simulate(strip('R&..B', { moveLimit: 2, wallBudget: 2 }), []);
  assert.deepEqual(stuckIn.steps, [[0, 2], [1, 2], [1, 2]]);
  assert.deepEqual(stuckIn.stuck, [2]);
  assert.equal(stuckIn.result, 'win');
  const justIn = simulate(strip('R&..B', { moveLimit: 1, wallBudget: 2 }), []);
  assert.deepEqual(justIn.steps, [[0, 2], [1, 2]]);
  assert.deepEqual(justIn.stuck, []);
  assert.equal(justIn.movesUsed, 1);
});

test('simulate: a route that fits the limit is a loss, with the whole replay', () => {
  const r = simulate(strip('R&..B', { moveLimit: 5, wallBudget: 2 }), []);
  assert.equal(r.result, 'lose');
  assert.equal(r.reason, 'reached');
  assert.equal(r.movesUsed, 5);
  assert.equal(r.steps.length, 6);
});

test('simulate: a slide is one move of the limit and its trail is reported', () => {
  const cut = simulate(strip('R**.B', { moveLimit: 1, wallBudget: 2 }), []);
  assert.equal(cut.result, 'win');
  assert.deepEqual(cut.steps, [[0, 2], [3, 2]]);
  assert.deepEqual(cut.trails, [[], [[1, 2], [2, 2], [3, 2]]]);
  const full = simulate(strip('R**.B', { moveLimit: 2, wallBudget: 2 }), []);
  assert.equal(full.result, 'lose');
  assert.equal(full.movesUsed, 2);
});

test('simulate: a teleport move keeps its via and teleports under v5', () => {
  const lv = v5(['#####', '#####', 'R*a##', '####a', '####B'], { moveLimit: 5, wallBudget: 2 });
  const r = simulate(lv, []);
  assert.deepEqual(r.teleports, [1]);
  assert.deepEqual(r.via, [null, [2, 2], null]);
});

test('simulate: v5 validates walls like v4 (buildable lines on ice, no cut, budget)', () => {
  const lv = v5(['#####', '.....', 'R**.B', '#####', '#####'], { moveLimit: 5, wallBudget: 1 });
  assert.equal(simulate(lv, [[1, 2, 'R']]).result, 'win'); // route round by row 1 costs 6
  assert.equal(simulate(lv, [[2, 2, 'R']]).result, 'lose'); // costs 5
  assert.throws(() => simulate(strip('R**.B', { wallBudget: 1 }), [[0, 2, 'R']]), /cut every route/);
  assert.throws(() => simulate(lv, [[1, 2, 'R'], [2, 2, 'R']]), /budget/);
  assert.throws(() => simulate(lv, [[1, 2, 'D']]), /not buildable/);
});

test('v4 and v3.1 results keep their exact shapes (no v5 fields)', () => {
  const lv = parseLevel(makeLevel(['R...B', '.....', '.....', '.....', '.....'], { rules: 'v4', moveLimit: 4 }));
  assert.deepEqual(Object.keys(findPath(lv, [])).sort(), ['lines', 'positions', 'teleports', 'via']);
  assert.deepEqual(Object.keys(simulate(lv, [])).sort(), ['movesUsed', 'reason', 'result', 'steps', 'teleports', 'via']);
});

// ---------------------------------------------------------------- solve / countAnswers

test('solve: a fence between two ice tiles is the one par answer', () => {
  const lv = v5(['#####', '.....', 'R**.B', '#####', '#####'], { moveLimit: 5, wallBudget: 3 });
  const s = solve(lv);
  assert.equal(s.par, 1);
  assert.deepEqual(s.answer, [[1, 2, 'R']]);
  // [1,2,R] makes the route 6 > 5; [0,2,R] and [2,2,R] make it 5 and [3,2,R] makes it 4
  assert.equal(countAnswers(lv, 1), 1);
});

test('solve: mud counts two moves', () => {
  assert.equal(solve(strip('R&..B', { moveLimit: 4, wallBudget: 2 })).par, 0); // cost 5 > 4 already
  assert.equal(solve(strip('R&..B', { moveLimit: 5, wallBudget: 2 })), null); // every fence cuts the only route
});

test('solve: a win that needs the cut board reconnected is found (cut states are not dead ends under v5)', () => {
  const lv = v5(['#####', '##B##', 'R***#', '#####', '#####'], { moveLimit: 1, wallBudget: 3 });
  const s = solve(lv);
  assert.equal(s.par, 1); // [2,2,R]: the route then costs 2 > 1
  assert.deepEqual(s.answer, [[2, 2, 'R']]);
  assert.equal(countAnswers(lv, 1), 1);
});

test('solve under v5 honours exactPar, maxPar and maxNodes', () => {
  const lv = v5(['#####', '.....', 'R**.B', '#####', '#####'], { moveLimit: 5, wallBudget: 3 });
  assert.equal(solve(lv, { exactPar: 1 }).par, 1);
  assert.equal(solve(lv, { exactPar: 0 }), null);
  assert.equal(solve(lv, { maxPar: 0 }), null);
  assert.equal(solve(lv, { maxNodes: 1 }), null);
});

// Regression (independent review of 8c): the v4 packing lower bound is unsound under v5, because a gate feeding ice lets
// fences on the first route create a second short route. With the bound on, these give par 3, null and 0.
test('solve and countAnswers stay exact where the v4 packing bound would be wrong', () => {
  const a = v5(['..R*..*', '.###...', '*#a#*..', '..*<.*.', '*#b#.#.', '.###&..', '#aBb#*&'], { moveLimit: 10 });
  assert.equal(solve(a, { maxPar: 4 }).par, 2);
  assert.equal(countAnswers(a, 2, 50), 12);
  const b = v5(['.......', '.###...', '.#a#...', 'R.*<...', '.#b#...', '.###...', '#aBb#..'], { moveLimit: 14 });
  assert.equal(solve(b, { maxPar: 1 }).par, 1);
  assert.equal(countAnswers(b, 1, 50), 1);
});
