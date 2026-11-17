// Gnome tools (rules v5, Hard): one test per spec sentence. Spec: docs/GAME_SPEC.md,
// "Gnome tools (Hard)" and "Route and move counting (v5)".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from './level.js';
import { findPath } from './path.js';
import { simulate, cutsAllRoutes } from './simulate.js';
import { solve, countAnswers } from './solve.js';
import { makeLevel } from './fixtures.test.js';

function lv(tiles, tool, extra = {}) {
  return parseLevel(makeLevel(tiles, { rules: 'v5', ...(tool ? { tool } : {}), ...extra }));
}
const ROCK = '#####';
/** 5x5 board with `row` on y = 2 and rock elsewhere. */
const strip = (row, tool, extra = {}) => lv([ROCK, ROCK, row, ROCK, ROCK], tool, extra);
const moves = (r) => r.positions.length - 1;
const pos = (r) => r.positions.map(([x, y]) => `${x},${y}`).join(' ');

// ---------------------------------------------------------------- parsing

test('tool: v5 accepts ladder, pickaxe and plank; level.tool is null when absent', () => {
  const tiles = ['R....', '.....', '.....', '.....', '....B'];
  for (const t of ['ladder', 'pickaxe', 'plank']) assert.equal(lv(tiles, t).tool, t);
  assert.equal(lv(tiles).tool, null);
});

test('tool: an unknown or non-string value is rejected on v5', () => {
  const tiles = ['R....', '.....', '.....', '.....', '....B'];
  for (const bad of ['sword', '', 'Ladder', 1, null, true, ['ladder']]) {
    assert.throws(() => parseLevel(makeLevel(tiles, { rules: 'v5', tool: bad })), /tool/, JSON.stringify(bad));
  }
});

test('tool: still rejected on v3.1 and v4', () => {
  const tiles = ['R....', '.....', '.....', '.....', '....B'];
  assert.throws(() => parseLevel(makeLevel(tiles, { rules: 'v4', tool: 'ladder' })), /tool/);
  assert.throws(() => parseLevel(makeLevel(tiles, { tool: 'ladder' })), /tool/);
});

// ---------------------------------------------------------------- no tool, no new fields

test('a v5 level without a tool has no tool fields in its route', () => {
  const r = findPath(strip('R...B'), []);
  assert.equal('toolStep' in r, false);
  assert.equal('toolUse' in r, false);
  assert.equal('toolFreeRoute' in r, false);
});

test('a level with a tool he does not use reports toolStep null and toolUse null', () => {
  const r = findPath(strip('R...B', 'ladder'), []);
  assert.equal(moves(r), 4);
  assert.equal(r.toolStep, null);
  assert.equal(r.toolUse, null);
  assert.equal(r.toolFreeRoute, true);
});

// ---------------------------------------------------------------- ladder

test('ladder: crosses one fenced line for 2 moves (prep move, then the crossing)', () => {
  const r = findPath(strip('R...B', 'ladder'), [[1, 2, 'R']]);
  assert.equal(moves(r), 5); // 1 + 2 + 1 + 1
  assert.equal(pos(r), '0,2 1,2 1,2 2,2 3,2 4,2');
  assert.equal(r.toolStep, 3); // the move that arrives across the fence
  assert.deepEqual(r.toolUse, { tool: 'ladder', prep: 2, line: [1, 2, 'R'], from: [1, 2], to: [2, 2] });
  assert.deepEqual(r.stuck, []); // the prep move is not a mud move
  assert.deepEqual(r.trails[2], []);
  assert.deepEqual(r.trails[3], [[2, 2]]);
  assert.equal(r.toolFreeRoute, false);
});

test('ladder: he uses it only where it makes the route cheaper', () => {
  const open = ['#####', '.....', 'R...B', '#####', '#####'];
  const walls = [[1, 2, 'R']];
  const withTool = findPath(lv(open, 'ladder'), walls);
  const plain = findPath(lv(open), walls);
  assert.equal(moves(plain), 6);
  assert.equal(moves(withTool), 5);
  assert.equal(withTool.toolStep, 3);
  assert.equal(withTool.toolFreeRoute, true);
  // no fence on the way: he does not use it (and cannot)
  assert.equal(findPath(lv(open, 'ladder'), []).toolStep, null);
});

test('ladder: on a tie he prefers not to use it', () => {
  // the teleporter pair makes the way round cost 5, the same as climbing the fence
  const tiles = ['#####', '.aa..', 'R...B', '#####', '#####'];
  const walls = [[1, 2, 'R']];
  const withTool = findPath(lv(tiles, 'ladder'), walls);
  const plain = findPath(lv(tiles), walls);
  assert.equal(moves(plain), 5);
  assert.equal(moves(withTool), 5);
  assert.equal(withTool.toolStep, null);
  assert.equal(withTool.toolUse, null);
  assert.deepEqual(withTool.positions, plain.positions);
});

test('ladder: at most once', () => {
  assert.equal(findPath(strip('R...B', 'ladder'), [[1, 2, 'R'], [2, 2, 'R']]), null);
  assert.ok(findPath(strip('R...B', 'ladder'), [[1, 2, 'R']]));
});

test('ladder: only over a player fence, never rock or river lines', () => {
  assert.equal(findPath(strip('R.#.B', 'ladder'), [[0, 2, 'R']]), null); // climbing does not pass rock
  assert.equal(findPath(strip('R.~.B', 'ladder'), [[0, 2, 'R']]), null);
  assert.equal(findPath(strip('R...B', 'ladder'), []).toolStep, null);
});

test('ladder: never in the middle of a slide (a move that starts on ice is a normal step)', () => {
  // He slides onto (2,2) and stops at the fence; crossing it is a fresh step costing 2.
  const r = findPath(strip('R**.B', 'ladder'), [[2, 2, 'R']]);
  assert.equal(pos(r), '0,2 2,2 2,2 3,2 4,2');
  assert.equal(moves(r), 4); // 1 (slide, stopped by the fence) + 2 + 1; a mid-slide ladder would cost 3
  assert.equal(r.toolStep, 3);
  assert.deepEqual(r.toolUse.line, [2, 2, 'R']);
});

test('ladder: after the crossing, ice slides, mud adds its move and a teleporter jumps', () => {
  const ice = findPath(strip('R.**B', 'ladder'), [[1, 2, 'R']]);
  assert.equal(pos(ice), '0,2 1,2 1,2 4,2');
  assert.equal(moves(ice), 3);
  assert.deepEqual(ice.trails[3], [[2, 2], [3, 2], [4, 2]]);
  assert.equal(ice.toolStep, 3);

  const mud = findPath(strip('R.&.B', 'ladder'), [[1, 2, 'R']]);
  assert.equal(pos(mud), '0,2 1,2 1,2 2,2 2,2 3,2 4,2');
  assert.equal(moves(mud), 6); // 1 + 2 + 1 (stuck) + 1 + 1
  assert.deepEqual(mud.stuck, [4]);
  assert.equal(mud.toolStep, 3);

  const tele = lv(['#####', '#####', 'R.a.B', '####a', '#####'], 'ladder');
  const t = findPath(tele, [[1, 2, 'R']]);
  assert.equal(pos(t), '0,2 1,2 1,2 4,3 4,2');
  assert.equal(moves(t), 4); // 1 + 2 (climb and jump) + 1
  assert.deepEqual(t.teleports, [3]);
  assert.deepEqual(t.via[3], [2, 2]);
  assert.equal(t.toolStep, 3);
});

test('ladder: the fence still stops a slide that starts after the crossing', () => {
  // across the fence onto ice at (2,2); a second fence at (3,2)R stops the slide on (3,2)
  const r = findPath(strip('R.**B', 'ladder'), [[1, 2, 'R'], [3, 2, 'R']]);
  assert.equal(r, null); // he stops on (3,2) and would need a second ladder
  assert.ok(findPath(strip('R.**B', 'ladder'), [[1, 2, 'R']]));
});

// ---------------------------------------------------------------- pickaxe

test('pickaxe: steps onto one rock tile for 2 moves; the rock tile is grass afterwards', () => {
  const r = findPath(strip('R#..B', 'pickaxe'), []);
  assert.equal(pos(r), '0,2 0,2 1,2 2,2 3,2 4,2');
  assert.equal(moves(r), 5);
  assert.equal(r.toolStep, 2);
  assert.deepEqual(r.toolUse, { tool: 'pickaxe', prep: 1, tile: [1, 2], from: [0, 2], to: [1, 2] });
  assert.equal(r.toolFreeRoute, false); // no way home without it
  // he can leave the dug tile in any direction (it is grass now)
  const bend = lv(['#B###', '~.###', 'R####', '#####', '#####'], 'pickaxe');
  const b = findPath(bend, []);
  assert.equal(pos(b), '0,2 0,2 1,2 1,1 1,0');
  assert.equal(moves(b), 4);
});

test('pickaxe: only where cheaper, tie prefers no tool, at most once', () => {
  const open = ['#####', '.....', 'R#..B', '#####', '#####'];
  const r = findPath(lv(open, 'pickaxe'), []);
  assert.equal(moves(r), 5); // 2 + 3 beats the 6-move way round
  assert.equal(r.toolStep, 2);
  assert.equal(moves(findPath(lv(open), [])), 6);
  // teleporters make the way round cost 5 as well: no tool
  const tie = lv(['#####', '.aa..', 'R#..B', '#####', '#####'], 'pickaxe');
  const t = findPath(tie, []);
  assert.equal(moves(t), 5);
  assert.equal(t.toolStep, null);
  assert.deepEqual(t.positions, findPath(lv(['#####', '.aa..', 'R#..B', '#####', '#####']), []).positions);
  // two rocks in series need two pickaxes
  assert.equal(findPath(strip('R#.#B', 'pickaxe'), []), null);
});

test('pickaxe: only rock tiles (not river), never mid-slide', () => {
  assert.equal(findPath(strip('R~..B', 'pickaxe'), []), null);
  // a slide stopped by a rock does not dig: ice (1,2),(2,2) then rock (3,2): he stops on (2,2), then digs for 2
  const r = findPath(strip('R**#B', 'pickaxe'), []);
  assert.equal(pos(r), '0,2 2,2 2,2 3,2 4,2');
  assert.equal(moves(r), 4);
  assert.equal(r.toolStep, 3);
});

test('pickaxe: the rock tile is grass, not ice', () => {
  // a dug tile does not start a slide: he stands on (1,2) after the dig and then slides off normally
  const r = findPath(strip('R#*.B', 'pickaxe'), []);
  assert.equal(pos(r), '0,2 0,2 1,2 3,2 4,2');
});

// ---------------------------------------------------------------- plank

test('plank: steps onto one river tile for 1 move, then must step off onto land', () => {
  const r = findPath(strip('R~..B', 'plank'), []);
  assert.equal(pos(r), '0,2 1,2 2,2 3,2 4,2');
  assert.equal(moves(r), 4);
  assert.equal(r.toolStep, 1);
  assert.deepEqual(r.toolUse, { tool: 'plank', prep: null, tile: [1, 2], from: [0, 2], to: [1, 2] });
  assert.equal(r.toolFreeRoute, false);
});

test('plank: never on to another river tile, at most once', () => {
  assert.equal(findPath(strip('R~~.B', 'plank'), []), null);
  assert.equal(findPath(strip('R~.~B', 'plank'), []), null);
  assert.equal(findPath(strip('R~#.B', 'plank'), []), null); // nowhere to step off to
  assert.ok(findPath(strip('R~=.B', 'plank'), [])); // a bridge is land
});

test('plank: only where cheaper, tie prefers no tool', () => {
  const open = ['#####', '.....', 'R~..B', '#####', '#####'];
  const r = findPath(lv(open, 'plank'), []);
  assert.equal(moves(r), 4);
  assert.equal(r.toolStep, 1);
  assert.equal(moves(findPath(lv(open), [])), 6);
  // the way round costs 4 through a teleporter pair, the same as the plank: no plank
  const tie = ['#####', 'a.a..', 'R~..B', '#####', '#####'];
  const t = findPath(lv(tie, 'plank'), []);
  assert.equal(moves(t), 4);
  assert.equal(t.toolStep, null);
});

test('plank: after the step off, ice slides, mud adds its move and a teleporter jumps', () => {
  const ice = findPath(strip('R~**B', 'plank'), []);
  assert.equal(pos(ice), '0,2 1,2 4,2'); // river, then one slide to the house
  assert.equal(moves(ice), 2);
  const mud = findPath(strip('R~&.B', 'plank'), []);
  assert.equal(moves(mud), 5); // 1 + 2 (step and stuck) + 1 + 1
  assert.deepEqual(mud.stuck, [3]);
  const tele = findPath(lv(['#####', '#####', 'R~a.B', '####a', '#####'], 'plank'), []);
  assert.equal(pos(tele), '0,2 1,2 4,3 4,2');
  assert.deepEqual(tele.teleports, [2]);
});

test('plank: cannot be used on rock or on a fence line', () => {
  assert.equal(findPath(strip('R#..B', 'plank'), []), null);
});

// ---------------------------------------------------------------- the no-cut rule ignores the tool

test('no-cut: a fence set is legal only if he has a route without the tool', () => {
  const l = strip('R...B', 'ladder');
  assert.ok(findPath(l, [[1, 2, 'R']])); // he could climb it
  assert.equal(cutsAllRoutes(l, [[1, 2, 'R']]), true); // but the fence cuts every tool-free route
  assert.throws(() => simulate(l, [[1, 2, 'R']]), /cut every route/);
  assert.equal(cutsAllRoutes(l, []), false);
  // pickaxe and plank levels: the rock/river is already a cut, but with no fences it is a legal (empty) set? No:
  // the board has no tool-free route at all, so the empty set cuts too.
  assert.equal(cutsAllRoutes(strip('R#..B', 'pickaxe'), []), true);
  assert.equal(cutsAllRoutes(strip('R~..B', 'plank'), []), true);
});

test('no-cut: a plain level with a tool does not cut when a tool-free route exists', () => {
  const open = lv(['#####', '.....', 'R...B', '#####', '#####'], 'ladder');
  assert.equal(cutsAllRoutes(open, [[1, 2, 'R']]), false);
});

// ---------------------------------------------------------------- simulate

test('simulate: win/lose, steps and the tool fields, cut at the move limit like steps', () => {
  const open = ['#####', '.....', 'R...B', '#####', '#####'];
  const walls = [[1, 2, 'R']];
  const full = simulate(lv(open, 'ladder', { moveLimit: 5 }), walls); // route costs 5
  assert.equal(full.result, 'lose');
  assert.equal(full.toolStep, 3);
  assert.equal(full.toolUse.tool, 'ladder');
  const cut = simulate(lv(open, 'ladder', { moveLimit: 4 }), walls);
  assert.equal(cut.result, 'win');
  assert.equal(cut.steps.length, 5);
  assert.equal(cut.toolStep, 3);
  const early = simulate(lv(open, 'ladder', { moveLimit: 2 }), walls);
  assert.equal(early.steps.length, 3);
  assert.equal(early.toolStep, null); // moves ran out before he crossed
  assert.equal(early.toolUse, null);
  assert.equal('toolStep' in simulate(lv(open), walls), false);
});

// ---------------------------------------------------------------- solve / countAnswers

test('solve: par is exact against the tool-using gnome (a ladder can climb the fence that was the answer)', () => {
  const open = ['#####', '.....', 'R...B', '#####', '#####'];
  const base = { moveLimit: 5, wallBudget: 6 };
  const plain = solve(lv(open, null, base));
  const ladder = solve(lv(open, 'ladder', base));
  assert.equal(plain.par, 1); // fence (1,2)R makes the way round 6 > 5
  assert.ok(ladder.par > plain.par, `ladder par ${ladder.par}, plain ${plain.par}`);
  // the stored answer wins against the tool-using gnome
  const l = lv(open, 'ladder', base);
  assert.equal(simulate(l, ladder.answer).result, 'win');
  assert.equal(countAnswers(l, ladder.par, 1000) >= 1, true);
  assert.equal(countAnswers(l, ladder.par - 1, 1000), 0);
});

test('solve: a tool-using level where no tool-free route is left is not a win (no-cut ignores the tool)', () => {
  // The strip needs the pickaxe to get home at all: the empty set already cuts the tool-free gnome, so
  // nothing the player fences can be a legal answer unless it reconnects a tool-free route (it cannot).
  const l = strip('R#..B', 'pickaxe', { moveLimit: 2, wallBudget: 4 });
  assert.equal(solve(l, { maxPar: 4 }), null);
});
