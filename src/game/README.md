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
| `simulate(level, walls)` | Validates walls (grass only, no duplicates, within budget; throws otherwise), then returns `{ result, reason, steps, teleports, movesUsed }`. `win/blocked`: no route, robot stays put. `win/too-far`: robot walks `moveLimit` moves and stops. `lose/reached`: beacon reached within the limit. |
| `solve(level, { maxPar })` | Exact par by iterative deepening on wall count, branching only on grass cells of the current shortest route. Returns `{ par, answer }` (answer sorted by row then column) or `null` if no wall set wins or `maxPar` is exceeded. |
| `countAnswers(level, k, cap = 50)` | Number of distinct k-wall winning sets, exact up to `cap`. |
| `createRng(seed)` | Seeded PRNG (mulberry32): `next()`, `int(lo, hi)`, `pick(arr)`, `chance(p)`, `shuffle(arr)`. |

Coordinates are `[x, y]` from the top left. Cell index inside the engine is `y * size + x`.

## Level generator

`tools/generate.js` (repo root, not shipped) makes and filters levels offline:

```
node tools/generate.js --size 9 --count 5 --seed 1 --min-par 3 --unique
```

It writes `levels/generated/size<N>-seed<S>.json` (an array of levels in the spec format). Same seed, same output. Other flags: `--max-par` (give up on candidates above this, default 6), `--max-tries`, `--out <dir>`.
