# src/game

The puzzle engine lives here (Phase 3). Rules for this folder:

- Pure JavaScript ES modules. No DOM, no `window`, no timers. The UI imports from here; nothing here imports from the UI.
- Every module ships with a `*.test.js` beside it, run by `node --test "src/**/*.test.js"`.
- Tests come first. For the level generator, the first test is "every generated level is solvable", checked by brute force on small grids.
- Randomness takes a seed, so any bug a player hits can be replayed exactly.

## API

Import everything from `src/game/index.js` (relative paths only; the site is served from `/invisible-maze/`).

**Wall format (rules v3).** Walls sit on the lines between tiles: `[x, y, "R"]` is the line right of tile `[x, y]` (between `[x, y]` and `[x + 1, y]`), `[x, y, "D"]` is the line below it (between `[x, y]` and `[x, y + 1]`). Every line has exactly one canonical form, so there is no `"L"` or `"U"`. A wall blocks movement across the line in both directions. The outer border is already a wall and can't be drawn on. **Guard rule:** a line can be walled only if both tiles beside it are plain grass, so never a line touching the robot start, the beacon, a bridge, a teleporter, a river or a rock.

**Rules per level (v3.1 and v4).** A level may carry `"rules": "v3.1"` (the default when the field is absent) or `"v4"`; anything else is rejected by `parseLevel`. The pack, the daily and the Lab are all v4 now (26 Oct); `"v3.1"` stays supported in the engine for old data. Rules v4:

- A line can be walled when both tiles beside it are **walkable**: grass, bridge, teleporter, the robot start and the beacon all count. River, rock and the outer border still can't be walled.
- **Side cap:** a wall set may wall at most `SIDE_CAP` (2) sides of the robot start and at most 2 sides of the beacon (a line between the start and the beacon counts for both). This is part of wall-set validity: `simulate` throws on a set over the cap, and `solve` / `countAnswers` treat a set over the cap as illegal and prune it (no superset can fix it).
- The no-cut rule applies to both rule sets.
- `level.rules` holds the rule set. `lineBuildable` follows it. The UI refuses the over-cap wall with `wouldBreakCap(level, walls, line)`, which returns `null`, `"start"` or `"beacon"` (the reason). `capViolation(level, walls)` checks a whole set and `sideCounts(level, walls)` gives the two counts. Under v3.1 all three say "fine" (those lines can't be walled at all).

**Answer field.** Every shipped level carries `"answer"`, one par answer (`[x, y, "R" | "D"]` walls, the engine's `solve` result). `parseLevel` passes it through as `level.answer`; the hint button places walls from it. Pack and daily tests check it is legal, par-sized and wins.

**No-cut rule (v3.1):** the player may not cut off every route. A wall set that leaves the robot no route to the beacon is illegal (the game refuses the wall as it is placed, using `cutsAllRoutes`). So every win is "out of moves": the shortest route is longer than the move limit.

| Export | What it does |
|---|---|
| `parseLevel(json)` | Validates the spec's level format and returns a normalised level: `size`, `grid`, `start`, `beacon`, `partners`, `moveLimit`, `wallBudget`, `rules`, optional `par`, `parAnswers`, `answer`, plus `tile(x,y)`, `walkable(x,y)`, `lineBuildable(x,y,dir)`, `partner(x,y)`. Throws a clear error for non-square grids, missing or duplicate `R`/`B`, teleporter letters not appearing exactly twice, unknown tiles. (`level.buildable(x,y)` for tiles is gone with tile walls.) |
| `buildableLines(level)` | Every line that can take a wall under the level's rules, as canonical walls `[x, y, "R" or "D"]`, ordered by row, then column, then R before D. v3.1: exactly the grass-beside-grass lines inside the border. v4: every walkable-beside-walkable line inside the border. |
| `wouldBreakCap(level, walls, line)`, `capViolation(level, walls)`, `sideCounts(level, walls)` | The v4 side cap (see above). `SIDE_CAP` and `RULES` are exported too. |
| `findPath(level, walls)` | Shortest route start to beacon with extra walls. Returns `{ positions, teleports, via, lines }` or `null`. A teleport is one move; `positions[i]` is where the robot ends move `i`, `teleports` lists the move indices that were jumps, `via[i]` is the teleporter tile stepped onto, `lines[i]` is the line index crossed by move `i + 1` (index = `2 * (y * size + x)`, plus 1 for "D"). Ties broken up, right, down, left. It respects every wall passed in and does not check the guard rule (that is `simulate`'s job): a wall on the line next to a teleporter stops the approach, but nothing stops the jump itself, which crosses no line. |
| `cutsAllRoutes(level, walls)` | `true` if the walls leave the robot no route to the beacon (the move the UI must refuse). Routing only: it does not check the guard rule or the budget, `simulate` does. A level with no route at all is always cut. |
| `simulate(level, walls)` | Validates walls (canonical form, inside the grid, not the border, buildable, no duplicates, within budget, and **leaves a route**; throws a clear error otherwise), then returns `{ result, reason, steps, teleports, via, movesUsed }` (`via[i]` is the teleporter tile stepped onto for move `i`, or `null`). Results are only `win/too-far` (robot walks `moveLimit` moves and stops) and `lose/reached` (beacon reached within the limit). |
| `solve(level, { maxPar, maxNodes })` | Exact par by iterative deepening on wall count, branching only on buildable lines the current shortest route crosses (each move crosses one line: the one between the tile it left and the tile it stepped onto; a teleport jump crosses none). Counts only wall sets that leave a route: a state with every route cut is a dead end and is pruned, because more walls can never reconnect it. Returns `{ par, answer }` (answer sorted by row, column, R before D) or `null` if no wall set wins or `maxPar` is exceeded. `maxNodes` is an optional deterministic work budget (search states) for the offline generator: when exceeded it also returns `null`. Pruning: besides cut states, a state is dropped when a packing lower bound (routes that fit the move limit and share no wallable line) exceeds the walls left. Rules v4: the side cap is checked before a line is added. |
| `countAnswers(level, k, cap = 50)` | Number of distinct k-wall winning sets (a route exists and is longer than the limit), exact up to `cap`. |
| `stars(par, wallsUsed, wallBudget, hintsUsed = 0)` | Stars for a win: 3 at par, 2 at par + 1, 1 otherwise within budget, 0 over budget. Each hint used on the attempt takes off 1 star, never below 1 for a win (`max(1, stars - hintsUsed)`). The 3-argument call is unchanged. |
| `createRng(seed)` | Seeded PRNG (mulberry32): `next()`, `int(lo, hi)`, `pick(arr)`, `chance(p)`, `shuffle(arr)`. |

Coordinates are `[x, y]` from the top left. Cell index inside the engine is `y * size + x`; line index is `2 * cell + (dir === "D" ? 1 : 0)`.

Solve time: about 1 to 3 ms on shipped 7x7 and 9x9 boards, tens of ms in the worst candidates the generator tries.

## Level generator

`tools/generate.js` (repo root, not shipped) makes and filters levels offline. 7x7 and 9x9 only (5x5 generation is gone):

```
node tools/generate.js --size 9 --count 5 --seed 1 --min-par 3 --max-par 5
```

It writes `levels/generated/size<N>-seed<S>.json` (an array of levels in the spec format) and prints a variety report: candidates tried, kept, rejected per reason, and how many kept levels use a teleporter on the open route. Same seed, same output.

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

`tools/build-pack.js` builds `assets/levels/pack-01.json` (shipped), `{ "id": "pack-01", "levels": [...] }`, all rules v4, `wallBudget = par + 2`, `par`, `parAnswers` (counted up to 50, a single par answer is not required) and one par answer in `answer`:

- 1 to 5: hand-authored **5x5** tutorial (par 1 to 3), one idea each, answers picked by hand and checked against the engine: walls lengthen a route; rocks; a bridge (wall its ends); a teleporter (wall right beside it); walls next to the robot or beacon (at most 2 sides).
- 6 to 15: generated 7x7, par 3 to 4. 16 to 25: generated 9x9, par 4 to 5. 26 to 30: generated 9x9, par 6 (four) and par 7 (one).
- Every bridge links two pieces of land (`isValidBridge` in `tools/generate.js`; the generator only places valid bridges and tests check every shipped level). Generated levels are ring-free. Within each band levels run easiest first (par, then route length), with a balanced mix of teleporter use.

Build time is about 6 minutes (par 6 about 11 to 50 s a level, par 7 a minute or more); run it in the foreground. `tools/pack.test.js` checks the file against the engine.

## Daily levels

`tools/build-daily.js` builds `assets/levels/daily.json` (shipped), `{ "id": "daily", "start": "2026-10-27", "levels": [...] }`. `levels[i]` is the level for `start + i` days, id `d-YYYY-MM-DD`, always 9x9, rules v4, `wallBudget = par + 2`, a stored par answer, no ring answer, bridges that span a river. Par follows the weekday, taken from the date string in UTC: Monday to Wednesday 4, Thursday to Saturday 5, Sunday 6.

```
node tools/build-daily.js [--days 180] [--start 2026-10-27] [--seed 20261027] [--out <file>] [--jobs 2] [--from 0 --to 180]
```

Every day is generated on its own sub-seed (`buildDay(i)`), so the batch is a pure function of the seed, start date and day index, and adding days never changes earlier ones. The full build takes about 9 minutes on 2 threads; `--from`/`--to` builds a range and merges it into `--out`, for runs under a time limit. `tools/daily.test.js` checks every level against the engine and proves par exactly on the first 14 days and every 5th day after.

## Lab pack

`tools/build-lab.js` builds `assets/levels/lab.json` (shipped), `{ "id": "lab", "rules": "v4", "levels": [...] }`, kept as the archive of the five levels that introduced v4 (their bridges predate the bridge fix): five levels `lab-01` to `lab-05` (two 7x7 at par 3 and 4, then three 9x9 at par 5, 6 and 7, or the best found), each with `"rules": "v4"`, `wallBudget = par + 2`, the exact `par`, `parAnswers` (counted up to 50, uniqueness not required) and one par answer in `"answer"`. Move limits carry more slack over the free route than the pack's. The builder prefers candidates whose answer uses a newly allowed line, and uses a deterministic work budget (`maxNodes`) rather than a clock, so the output is a pure function of the script. `generateLevels` takes `rules`, `budgetExtra` and `maxNodes` for this; the default call is unchanged apart from the new `answer` field on each level. `tools/lab.test.js` checks the file against the engine.
