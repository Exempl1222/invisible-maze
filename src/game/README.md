# src/game

The puzzle engine lives here (Phase 3). Rules for this folder:

- Pure JavaScript ES modules. No DOM, no `window`, no timers. The UI imports from here; nothing here imports from the UI.
- Every module ships with a `*.test.js` beside it, run by `node --test "src/**/*.test.js"`.
- Tests come first. For the level generator, the first test is "every generated level is solvable", checked by brute force on small grids.
- Randomness takes a seed, so any bug a player hits can be replayed exactly.

## API

Import everything from `src/game/index.js` (relative paths only; the site is served from `/invisible-maze/`).

| Export | What it does |
|---|---|
| `parseLevel(json)` | Validates the spec's level format and returns a normalised level: `size`, `grid`, `start`, `beacon`, `partners`, `moveLimit`, `wallBudget`, plus `tile(x,y)`, `walkable(x,y)`, `buildable(x,y)`, `partner(x,y)`. Throws a clear error for non-square grids, missing or duplicate `R`/`B`, teleporter letters not appearing exactly twice, unknown tiles. |
| `findPath(level, walls)` | Shortest route start to beacon with extra walls. Returns `{ positions, teleports, via }` or `null`. A teleport is one move; `positions[i]` is where the robot ends move `i`, `teleports` lists the move indices that were jumps, `via[i]` is the teleporter tile stepped onto. Ties broken up, right, down, left. |
| `simulate(level, walls)` | Validates walls (grass only, no duplicates, within budget; throws otherwise), then returns `{ result, reason, steps, teleports, via, movesUsed }` (`via[i]` is the teleporter tile stepped onto for move `i`, or `null`). `win/blocked`: no route, robot stays put. `win/too-far`: robot walks `moveLimit` moves and stops. `lose/reached`: beacon reached within the limit. |
| `solve(level, { maxPar })` | Exact par by iterative deepening on wall count, branching only on grass cells of the current shortest route. Returns `{ par, answer }` (answer sorted by row then column) or `null` if no wall set wins or `maxPar` is exceeded. |
| `countAnswers(level, k, cap = 50)` | Number of distinct k-wall winning sets, exact up to `cap`. |
| `stars(par, wallsUsed, wallBudget)` | Stars for a win: 3 at par, 2 at par + 1, 1 otherwise within budget, 0 over budget. |
| `createRng(seed)` | Seeded PRNG (mulberry32): `next()`, `int(lo, hi)`, `pick(arr)`, `chance(p)`, `shuffle(arr)`. |

Coordinates are `[x, y]` from the top left. Cell index inside the engine is `y * size + x`.

## Level generator

`tools/generate.js` (repo root, not shipped) makes and filters levels offline:

```
node tools/generate.js --size 9 --count 5 --seed 1 --min-par 3 --max-par 5
```

It writes `levels/generated/size<N>-seed<S>.json` (an array of levels in the spec format) and prints a variety report: candidates tried, kept, rejected per reason, and the win-reason mix of the kept levels. Same seed, same output.

Filters, applied to every candidate:

| Filter | Rejects when | Flag |
|---|---|---|
| Route length | the robot's no-walls route is shorter than the grid size (5, 7, 9) | `--min-route <n>` |
| Par range | par is below `--min-par` or above `--max-par` (default 6) | `--min-par`, `--max-par` |
| Ring | one cell is orthogonally adjacent to every wall of the par answer (`isRingAnswer`, exported) | `--no-ring-filter` turns it off |
| Uniqueness | more than one par answer. On by default for 7x7 and 9x9 | `--unique`, `--no-unique` |

Other flags: `--max-tries`, `--out <dir>`, `--min-slack` / `--max-slack` (move limit = open route + a random slack, default 2 to 6; low slack gives more `too-far` wins).

Report reasons: a candidate counts under the first filter it fails, in the order terrain, route length, par range, ring, uniqueness. Expect low yield on 9x9 (about 1 in 20,000 candidates at par 3 to 5 with all filters), so give `--max-tries` room.

## Level packs

`tools/build-pack.js` builds `assets/levels/pack-01.json` (shipped), `{ "id": "pack-01", "levels": [...] }`: five hand-authored 5x5 tutorial levels, fifteen generated 7x7 (par 2 to 4) and ten generated 9x9 (par 3 to 5), ids `p01-01` to `p01-30`, `wallBudget = par + 1`. It picks a balanced mix of par, win reason and teleporter use from each generated pool. `tools/pack.test.js` checks the file against the engine. Rebuilding takes about two minutes.
