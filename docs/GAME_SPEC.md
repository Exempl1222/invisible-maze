# Game spec v3 (locked 26 Oct 2026)

Source of truth for game logic. If something isn't answered here, stop and ask; don't invent rules. Changes go through a PR that edits this file first.

**What changed from v2:** walls now go on the grid lines between tiles, not on whole tiles, and lines touching the robot, beacon, bridges or teleporters can't be walled. 5x5 boards are gone. All levels are open while the game is in development. A daily level is added.

**Why:** in the v2 playtest, walling in the robot or the beacon won 2 stars on 21 of 30 levels without solving anything. A seeded prototype (150 levels at 7x7) compared rule sets on the same maps:

| Rules | Mean par | Levels with par 3+ | Caging wins 2+ stars |
|---|---|---|---|
| v2: walls fill tiles | 1.29 | 1% | 76% |
| Lines, anywhere | 1.26 | 1% | 81% |
| Tiles, nothing next to robot or beacon | 1.48 | 9% | 0% |
| **v3: lines, guarded** | **1.77** | **21%** | **0%** |

## Concept

A robot wants to reach the beacon and always takes the shortest route. Before it moves, you draw walls on the lines between tiles, all in one go, to stop it reaching the beacon within its move limit. Use as few walls as you can.

## Core rules

| Rule | Decision |
|---|---|
| Robot movement | One step per move: up, down, left or right, to the next tile. Never diagonal. It can't cross a walled line. |
| Robot route | Always a shortest route to the beacon given the board after your walls. |
| Tie-break | If several routes are equally short, the robot prefers up, right, down, left at each step. Cosmetic only: it never changes win or lose. |
| Turn order | Place every wall, press Go, watch. No changes once Go is pressed. |
| Win | No route to the beacon, or the shortest route is longer than the move limit. |
| Lose | The robot reaches the beacon within the move limit. |
| Robot with no route | Tries to move, bumps, and shows a trapped animation. That's a win. |
| Robot with a route that's too long | Walks its shortest route until it runs out of moves, then stops. That's a win. |
| Wall budget | Set per level. The UI won't let you place more. |
| Score | Par = fewest walls that win, computed exactly by the engine. 3 stars at par, 2 at par + 1, 1 at anything else within budget. Par is shown before you play. |
| Retries | Unlimited. No lives. |

## Walls (lines)

- A wall sits on the line between two orthogonally adjacent tiles. It blocks movement across that line in both directions.
- **A line can be walled only if both tiles beside it are walkable** (grass, bridge, teleporter, start or beacon) **and neither of them is the robot start, the beacon, a bridge or a teleporter.** In practice: lines between two grass tiles.
- The outer border of the board is already a wall and can't be drawn on.
- Wall format: `[x, y, "R"]` is the line on the right side of tile `[x, y]` (between `[x, y]` and `[x + 1, y]`); `[x, y, "D"]` is the line below tile `[x, y]` (between `[x, y]` and `[x, y + 1]`). Every line has exactly one canonical form.

## Tiles

| Tile | Symbol | Robot can walk on it | Lines beside it can be walled |
|---|---|---|---|
| Grass | `.` | Yes | Yes, if the other side is grass too |
| Rock | `#` | No | No (nothing to block) |
| River | `~` | No | No (nothing to block) |
| Bridge | `=` | Yes | No |
| Teleporter | lowercase letter, pairs share a letter | Yes | No |
| Robot start | `R` | Yes | No |
| Beacon | `B` | Yes | No |

**Teleporters:** stepping onto one moves the robot straight to its partner. Forced, two-way, and the whole jump counts as one move. The robot then continues from the partner tile. Walking onto the partner tile directly also teleports it back.

## Boards and levels

| Size | Use |
|---|---|
| 7x7 | Tutorial (first 5 levels, one new idea each) and main levels |
| 9x9 | Hard levels and the daily |

- **Level pack 1:** 30 levels. 5 hand-authored 7x7 tutorial levels, 15 generated 7x7 (par 2 to 4), 10 generated 9x9 (par 3 to 5). Every generated level has exactly one par answer.
- **All levels are open while in development.** No locks. Locks come back at launch.
- **Levels are generated offline and verified**, not made on the phone. The phone only plays and scores.

## Daily level

- A separate mode: one 9x9 level per calendar day, the same for everyone on that date.
- The day is the player's **local** date.
- Daily levels are generated offline in a batch (at least 120 days ahead) into `assets/levels/daily.json`, each verified like pack levels, with exactly one par answer and par 3 or more.
- If today's date is outside the batch, the page says the daily is taking a break instead of erroring.
- Best stars per date are saved like pack progress. Streaks and sharing come later.

## Hints and ads

- A hint reveals one wall from the par answer.
- Hints are earned by watching an ad, after launch. No ads until Phase 6.

## Engine guarantees

- `buildableLines(level)` lists every line that can be walled.
- `simulate(level, walls)` validates walls (buildable, no duplicates, within budget) and returns the robot's route (with teleports), the result and the moves used.
- `solve(level)` returns par and one par answer. Exact.
- `countAnswers(level, k)` returns how many k-wall answers exist (capped).
- Every shipped level has an answer within budget, and budget is at least par.
- Levels are reproducible from a seed. The engine is pure JS with no DOM.

## Level data format

Unchanged from v2: walls aren't part of the level, only of the answer.

```json
{
  "id": "p01-06",
  "size": 7,
  "tiles": ["...a...", ".....#.", "B.~~.~=", "~~=~=~.", "#......", "......R", "#....a."],
  "moveLimit": 9,
  "wallBudget": 3,
  "par": 2,
  "parAnswers": 1
}
```

Teleporter pairs use matching lowercase letters. Coordinates are `[x, y]` from the top left. This is level 6 of pack 1 exactly as shipped. (The v3 draft showed a made-up board here with the wrong par; the engine and an independent brute force both caught it.)
