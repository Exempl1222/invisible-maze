# Game spec v4 (locked 26 Oct 2026)

## Core rules at a glance (signed off by Eric)

1. The robot always takes the shortest route to the beacon.
2. You place all your walls on the lines between tiles before it moves.
3. **You can't cut off every route.** The robot must always have a way to the beacon.
4. You win when that way is longer than the robot's move limit.
5. Fewer walls, more stars. Par is the fewest walls that win.
6. You can wall lines next to bridges and teleporters, and up to 2 sides of the robot and of the beacon.
7. Each hint you use costs 1 star (minimum 1).

Source of truth for game logic. If something isn't answered here, stop and ask; don't invent rules. Changes go through a PR that edits this file first.

**What changed in v4 (26 Oct):** the Lab rules won Eric's playtest and are now the rules everywhere: walls allowed next to bridges and teleporters and on up to 2 sides of the robot and beacon, budget par + 2, a single par answer no longer required, and later levels go up to 6 to 7 walls. Generation timing under v4 (9x9, seconds per kept level): par 4 about 0.7, par 5 about 1.7, par 6 about 11; par 7 took about 4 minutes, so par-7 levels are rare and hand-picked.

**What changed in v3.1:** you can no longer cut off every route; every win is "out of moves". Prototype on the same 150 7x7 maps: levels with par 3+ rose from 17% (blocking allowed) to 27% (no blocking), mean par 1.73 to 2.20; on 9x9, 10% to 25%.

**What changed from v2:** walls now go on the grid lines between tiles, not on whole tiles, and lines touching the robot, beacon, bridges or teleporters can't be walled. 5x5 boards are gone. All levels are open while the game is in development. A daily level is added.

**Why:** in the v2 playtest, walling in the robot or the beacon won 2 stars on 21 of 30 levels without solving anything. A seeded prototype (150 levels at 7x7) compared rule sets on the same maps:

| Rules | Mean par | Levels with par 3+ | Caging wins 2+ stars |
|---|---|---|---|
| v2: walls fill tiles | 1.29 | 1% | 76% |
| Lines, anywhere | 1.26 | 1% | 81% |
| Tiles, nothing next to robot or beacon | 1.48 | 9% | 0% |
| **v3: lines, guarded** | **1.77** | **21%** | **0%** |

## Concept

A robot wants to reach the beacon and always takes the shortest route. Before it moves, you draw walls on the lines between tiles, all in one go, so its route to the beacon is longer than its move limit. You must leave it a way through. Use as few walls as you can.

## Core rules

| Rule | Decision |
|---|---|
| Every route cut | Not allowed. A wall that would leave the robot no route to the beacon is refused when you place it ("The robot needs at least one way through"). |
| Robot movement | One step per move: up, down, left or right, to the next tile. Never diagonal. It can't cross a walled line. |
| Robot route | Always a shortest route to the beacon given the board after your walls. |
| Tie-break | If several routes are equally short, the robot prefers up, right, down, left at each step. Cosmetic only: it never changes win or lose. |
| Turn order | Place every wall, press Go, watch. No changes once Go is pressed. |
| Win | The robot's shortest route is longer than the move limit. It walks until it runs out of moves. |
| Lose | The robot reaches the beacon within the move limit. |
| Wall budget | Set per level. The UI won't let you place more. |
| Wall budget rule | Budget = par + 2. |
| Score | Par = fewest walls that win, computed exactly by the engine. 3 stars at par, 2 at par + 1, 1 at anything else within budget, minus 1 star per hint used (minimum 1). Par is shown before you play. |
| Retries | Unlimited. No lives. |

## Walls (lines)

- A wall sits on the line between two orthogonally adjacent tiles. It blocks movement across that line in both directions.
- **A line can be walled if both tiles beside it are walkable** (grass, bridge, teleporter, start or beacon). Lines next to a river or rock can't be walled (nothing to block).
- **At most 2 sides of the robot start and at most 2 sides of the beacon** can be walled. A wall that would make it 3 is refused.
- (v3.1, retired: only grass-beside-grass lines could be walled. The engine still supports it for old data via `"rules": "v3.1"`.)
- The outer border of the board is already a wall and can't be drawn on.
- Wall format: `[x, y, "R"]` is the line on the right side of tile `[x, y]` (between `[x, y]` and `[x + 1, y]`); `[x, y, "D"]` is the line below tile `[x, y]` (between `[x, y]` and `[x, y + 1]`). Every line has exactly one canonical form.

## Tiles

| Tile | Symbol | Robot can walk on it | Lines beside it can be walled |
|---|---|---|---|
| Grass | `.` | Yes | Yes, if the other side is walkable |
| Rock | `#` | No | No (nothing to block) |
| River | `~` | No | No (nothing to block) |
| Bridge | `=` | Yes | Yes (its ends; the river sides have nothing to block) |
| Teleporter | lowercase letter, pairs share a letter | Yes | Yes |
| Robot start | `R` | Yes | Yes, at most 2 sides |
| Beacon | `B` | Yes | Yes, at most 2 sides |

**Teleporters:** stepping onto one moves the robot straight to its partner. Forced, two-way, and the whole jump counts as one move. The robot then continues from the partner tile. Walking onto the partner tile directly also teleports it back.

## Boards and levels

| Size | Use |
|---|---|
| 7x7 | Tutorial (first 5 levels, one new idea each) and main levels |
| 9x9 | Hard levels and the daily |

- **Level pack 1 (v4):** 30 levels, budget par + 2, a single par answer not required.
  - 1 to 5: hand-authored 7x7 tutorial (par 2 to 3), one idea each.
  - 6 to 15: 7x7, par 3 to 4.
  - 16 to 25: 9x9, par 4 to 5.
  - 26 to 30: 9x9, par 6 to 7 (including the two hardest Lab levels).
- **All levels are open while in development.** No locks. Locks come back at launch.
- **Levels are generated offline and verified**, not made on the phone. The phone only plays and scores.

## Daily level

- A separate mode: one 9x9 level per calendar day, the same for everyone on that date.
- The day is the player's **local** date.
- Daily levels are generated offline in a batch (180 days) into `assets/levels/daily.json`, each verified like pack levels. Rules v4, 9x9, par 4 to 5 on weekdays and par 6 on Sundays (a weekly hard day). A single par answer is not required.
- If today's date is outside the batch, the page says the daily is taking a break instead of erroring.
- Best stars per date are saved like pack progress. Streaks and sharing come later.

## Hints and ads

- A hint reveals one wall from the par answer.
- Hints are earned by watching an ad, after launch. No ads until Phase 6.

## Engine guarantees

- `buildableLines(level)` lists every line that can be walled.
- `cutsAllRoutes(level, walls)` returns true if the walls leave the robot no route to the beacon.
- `simulate(level, walls)` validates walls (buildable, no duplicates, within budget, leaves a route) and returns the robot's route (with teleports), the result and the moves used. Results are only `win/too-far` or `lose/reached`.
- `solve(level)` returns par and one par answer, counting only wall sets that leave a route. Exact.
- `countAnswers(level, k)` returns how many k-wall answers exist (capped).
- Every shipped level has an answer within budget, and budget is at least par.
- Levels are reproducible from a seed. The engine is pure JS with no DOM.

## Level data format

Unchanged from v2: walls aren't part of the level, only of the answer.

```json
{
  "id": "p01-06",
  "size": 7,
  "tiles": ["..=..B.", "..~....", "R.=~...", "..~~a#.", "..~...b", "ab=..##", "..~~..."],
  "moveLimit": 8,
  "wallBudget": 3,
  "par": 2,
  "parAnswers": 1
}
```

Teleporter pairs use matching lowercase letters. Coordinates are `[x, y]` from the top left. This is level 6 of pack 1 exactly as shipped under v3.1.

## Lab (experiments)

The Lab tab is where rule ideas are tested on a handful of levels before any rollout. v4 went through it first (below, kept for the record). Lab levels may carry their own `"rules"`.

### Lab rules v4 (tested 26 Oct, now the main rules)

Eric's proposal from the v3.1 playtest, tested on 5 levels before any rewrite. Applies only to levels with `"rules": "v4"`; the pack and daily stay on v3.1.

| Rule | v3.1 (live) | v4 (lab) |
|---|---|---|
| Lines touching a bridge or teleporter | Can't be walled | **Can be walled** (if the other side is walkable) |
| Lines touching the robot start or beacon | Can't be walled | **Can be walled, at most 2 sides each** |
| Lines touching river, rock or the border | Can't be walled | Can't be walled (nothing to block) |
| Cutting every route | Not allowed | Not allowed |
| Wall budget | par + 1 | **par + 2** |
| One par answer only | Required | Not required (count shown in data) |

Prototype (9x9, same maps): relaxing the line rules alone lowers par (mean 3.2 to 2.5); a bigger move-limit slack is what lifts par (slack about 7: mean par 4.0, 32% of levels at par 5+, 8% at par 6 to 7 under v4).

**Lab pack:** `assets/levels/lab.json`, 5 levels: 2 at 7x7 (par 3 to 4), 3 at 9x9 (par 5, 6 and 7 targeted). Each level stores one par answer in `"answer"` (used by hints).

## Hints (all levels)

- A hint places one wall from a par answer that isn't already on the board, drawn in a distinct hint style. It counts toward walls used. If the board already has every answer wall, the hint says so and isn't spent.
- **Inventory:** start with 3. Finishing a daily level (any stars) earns 1, once per date. Stored up to 10. A "Get more hints" button is reserved for ads; until Phase 6 it says ads are coming soon.
- **Hints cost stars (Eric, 26 Oct):** each hint used on an attempt lowers that win's stars by 1, minimum 1 star. Best stars per level keep the highest ever earned, so a level can be replayed for 3 stars without hints.
- Levels carry their par answer as `"answer"` for hints (pack, daily and lab). This lets a curious player read answers from the files; accepted for now.
