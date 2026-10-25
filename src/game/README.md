# src/game

The puzzle engine lives here (Phase 3). Rules for this folder:

- Pure JavaScript ES modules. No DOM, no `window`, no timers. The UI imports from here; nothing here imports from the UI.
- Every module ships with a `*.test.js` beside it, run by `node --test "src/**/*.test.js"`.
- Tests come first. For the level generator, the first test is "every generated level is solvable", checked by brute force on small grids.
- Randomness takes a seed, so any bug a player hits can be replayed exactly.

## API

Import everything from `src/game/index.js` (relative paths only; the site is served from `/invisible-maze/`).

**Wall format (rules v3).** Walls sit on the lines between tiles: `[x, y, "R"]` is the line right of tile `[x, y]` (between `[x, y]` and `[x + 1, y]`), `[x, y, "D"]` is the line below it (between `[x, y]` and `[x, y + 1]`). Every line has exactly one canonical form, so there is no `"L"` or `"U"`. A wall blocks movement across the line in both directions. The outer border is already a wall and can't be drawn on. **Guard rule:** a line can be walled only if both tiles beside it are plain grass, so never a line touching the robot start, the beacon, a bridge, a teleporter, a river or a rock.

| Export | What it does |
|---|---|
| `parseLevel(json)` | Validates the spec's level format and returns a normalised level: `size`, `grid`, `start`, `beacon`, `partners`, `moveLimit`, `wallBudget`, plus `tile(x,y)`, `walkable(x,y)`, `lineBuildable(x,y,dir)`, `partner(x,y)`. Throws a clear error for non-square grids, missing or duplicate `R`/`B`, teleporter letters not appearing exactly twice, unknown tiles. (`level.buildable(x,y)` for tiles is gone with tile walls.) |
| `buildableLines(level)` | Every line that can take a wall, as canonical walls `[x, y, "R" or "D"]`, ordered by row, then column, then R before D. Exactly the grass-beside-grass lines inside the border. |
| `findPath(level, walls)` | Shortest route start to beacon with extra walls. Returns `{ positions, teleports, via, lines }` or `null`. A teleport is one move; `positions[i]` is where the robot ends move `i`, `teleports` lists the move indices that were jumps, `via[i]` is the teleporter tile stepped onto, `lines[i]` is the line index crossed by move `i + 1` (index = `2 * (y * size + x)`, plus 1 for "D"). Ties broken up, right, down, left. It respects every wall passed in and does not check the guard rule (that is `simulate`'s job): a wall on the line next to a teleporter stops the approach, but nothing stops the jump itself, which crosses no line. |
| `simulate(level, walls)` | Validates walls (canonical form, inside the grid, not the border, buildable, no duplicates, within budget; throws a clear error otherwise), then returns `{ result, reason, steps, teleports, via, movesUsed }` (`via[i]` is the teleporter tile stepped onto for move `i`, or `null`). `win/blocked`: no route, robot stays put. `win/too-far`: robot walks `moveLimit` moves and stops. `lose/reached`: beacon reached within the limit. |
| `solve(level, { maxPar })` | Exact par by iterative deepening on wall count, branching only on buildable lines the current shortest route crosses (each move crosses one line: the one between the tile it left and the tile it stepped onto; a teleport jump crosses none). Returns `{ par, answer }` (answer sorted by row, column, R before D) or `null` if no wall set wins or `maxPar` is exceeded. |
| `countAnswers(level, k, cap = 50)` | Number of distinct k-wall winning sets, exact up to `cap`. |
| `stars(par, wallsUsed, wallBudget)` | Stars for a win: 3 at par, 2 at par + 1, 1 otherwise within budget, 0 over budget. |
| `createRng(seed)` | Seeded PRNG (mulberry32): `next()`, `int(lo, hi)`, `pick(arr)`, `chance(p)`, `shuffle(arr)`. |

Coordinates are `[x, y]` from the top left. Cell index inside the engine is `y * size + x`; line index is `2 * cell + (dir === "D" ? 1 : 0)`.

Solve time: about 1 to 3 ms on shipped 7x7 and 9x9 boards, tens of ms in the worst candidates the generator tries.

## Level generator

`tools/generate.js` (repo root, not shipped) makes and filters levels offline. 7x7 and 9x9 only (5x5 generation is gone):

```
node tools/generate.js --size 9 --count 5 --seed 1 --min-par 3 --max-par 5
```

It writes `levels/generated/size<N>-seed<S>.json` (an array of levels in the spec format) and prints a variety report: candidates tried, kept, rejected per reason, and the win-reason mix of the kept levels. Same seed, same output.

Terrain: scattered rocks, one meandering river with 2 to 4 bridges, one or two teleporter pairs, start and beacon on grass far apart, random orientation.

Filters, applied to every candidate:

| Filter | Rejects when | Flag |
|---|---|---|
| Route length | the robot's no-walls route is shorter than the grid size (7 or 9) | `--min-route <n>` |
| Par range | par is below `--min-par` or above `--max-par` (default 6) | `--min-par`, `--max-par` |
| Ring | one tile is touched by every line of the par answer (`isRingAnswer`, exported; a line touches the two tiles beside it) | `--no-ring-filter` turns it off |
| Uniqueness | more than one par answer. On by default | `--unique`, `--no-unique` |

Other flags: `--max-tries`, `--out <dir>`, `--min-slack` / `--max-slack` (move limit = open route + a random slack, default 2 to 6; low slack gives more `too-far` wins).

Report reasons: a candidate counts under the first filter it fails, in the order bad terrain, duplicate board, route too short, unsolvable (no wall set wins), par out of range, ring, not unique.

## Level packs

`tools/build-pack.js` builds `assets/levels/pack-01.json` (shipped), `{ "id": "pack-01", "levels": [...] }`: five hand-authored 7x7 tutorial levels (one idea each: lines on open grass, rocks, river and bridge, a teleporter pair, a move limit), fifteen generated 7x7 (par 2 to 4) and ten generated 9x9 (par 3 to 5), ids `p01-01` to `p01-30`, `wallBudget = par + 1`, `par` and `parAnswers` from the engine. Generated levels come from a pool of 300 per size, taking a quota of each par and balancing win reasons and teleporter use. Within each band levels run easiest first (par, then route length). Rebuilding takes under a minute. `tools/pack.test.js` checks the file against the engine.

## Daily levels

`tools/build-daily.js` builds `assets/levels/daily.json` (shipped), `{ "id": "daily", "start": "2026-10-27", "levels": [...] }`. `levels[i]` is the level for `start + i` days, id `d-YYYY-MM-DD`, always 9x9, par 3 or more, exactly one par answer, no ring answer, `wallBudget = par + 1`.

```
node tools/build-daily.js [--days 180] [--start 2026-10-27] [--seed 20261027] [--out <file>]
```

Every day is generated on its own sub-seed (par 3+ most days, 4+ every third day, 5+ every 15th), so the batch is a pure function of the seed, start date and day index, and adding days never changes earlier ones. `tools/daily.test.js` checks every level against the engine.
