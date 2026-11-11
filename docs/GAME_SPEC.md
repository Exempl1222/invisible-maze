# Game spec v5 (locked 11 Nov 2026)

## Core rules at a glance (signed off by Eric)

1. The robot always takes the shortest route to the beacon.
2. You place all your walls on the lines between tiles before it moves.
3. **You can't cut off every route.** The robot must always have a way to the beacon.
4. You win when that way is longer than the robot's move limit.
5. Fewer walls, more stars. Par is the fewest walls that win.
6. You can wall lines next to bridges and teleporters, and up to 2 sides of the robot and of the beacon.
7. Each hint you use costs 1 star (minimum 1).

Source of truth for game logic. If something isn't answered here, stop and ask; don't invent rules. Changes go through a PR that edits this file first.

**What changed in v5 (11 Nov):** the Play game splits into three 20-level tiers (Easy 5x5, Medium 7x7, Hard 9x9). Medium adds ice, mud and one-way gates; Hard gives the gnome one tool (ladder, pickaxe or plank). New tiles and tools only exist on levels marked `"rules": "v5"`; every v4 rule still holds there. The daily stays on v4. Plan and reasoning: `docs/PLAY_PLAN.md`. Section: "Rules v5" below.

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

**Bridges link two pieces of land:** a bridge tile has walkable land (not river, rock or another bridge, and on the board) on both opposite sides along one axis, and river on both sides of the other axis. Rocks never sit on a bridge's landing tiles. (Audit of the v3.1 data on 26 Oct: 38 of 79 pack bridges and 309 of 544 daily bridges broke this, by leading into river at a bend, touching the board edge, or landing on a rock. The generator now enforces it and the tests check every shipped bridge.)

**Teleporters:** stepping onto one moves the robot straight to its partner. Forced, two-way, and the whole jump counts as one move. The robot then continues from the partner tile. Walking onto the partner tile directly also teleports it back.

## Boards and levels

| Size | Use |
|---|---|
| 5x5 | Easy tier (v5); pack 1's tutorial |
| 7x7 | Medium tier (v5); pack 1's main levels; the Easy daily |
| 9x9 | Hard tier (v5); pack 1's hard levels; the Hard daily |

Pack 1 below is live until the Easy pack ships (see "Rules v5", Tiers).

- **Level pack 1 (v4):** 30 levels, budget par + 2, a single par answer not required.
  - 1 to 5: hand-authored **5x5** tutorial (par 1 to 3), one idea each.
  - 6 to 15: 7x7, par 3 to 4.
  - 16 to 25: 9x9, par 4 to 5.
  - 26 to 30: 9x9, par 6 to 7 (generated; at least one par 7).
- **All levels are open while in development.** No locks. Locks come back at launch.
- **Levels are generated offline and verified**, not made on the phone. The phone only plays and scores.

## Rules v5 (Play tiers, signed off 11 Nov 2026)

v5 is v4 plus the tiles and tools below. A v4 level parses and plays exactly as before. `parseLevel` rejects the new symbols and the `tool` field on any level that isn't `"rules": "v5"`.

### Tiers

| Tier | Pack file | Board | Levels | Par | Mechanics |
|---|---|---|---|---|---|
| Easy | `assets/levels/easy.json` | 5x5 | 1 to 20 | 1 to 4 | v4 only (no new tiles) |
| Medium | `assets/levels/medium.json` | 7x7 | 21 to 40 | 3 to 5 | Ice, mud, gates |
| Hard | `assets/levels/hard.json` | 9x9 | 41 to 60 | 4 to 7 (at least one 7) | One gnome tool per level, Medium tiles from level 56 |

- Easy 1 to 5 are pack 1's hand-authored tutorial, unchanged. Stars earned on `p01-01` to `p01-05` carry to Easy 1 to 5. Pack 1 retires when the Easy pack ships.
- Budget stays par + 2. Stars, hints and the no-cut rule are unchanged.
- Each new mechanic is introduced in order: 1 level where it alone decides par, then 2 where it combines with a known idea, then it joins the mix. Medium: ice 21 to 25, mud 26 to 30, gates 31 to 34, mixed 35 to 40. Hard: ladder 41 to 45, pickaxe 46 to 50, plank 51 to 55, mixed 56 to 60.
- All tiers are open in development; at launch each tier unlocks when the one before is finished.

### New tiles

| Tile | Symbol | Walkable | Lines beside it can be fenced | Rule |
|---|---|---|---|---|
| Ice | `*` | Yes | Yes, if the other side is walkable | See Ice |
| Mud | `&` | Yes | Yes, if the other side is walkable | Stepping onto mud costs 2 moves |
| Gate | `>` `<` `^` `v` | Yes, only along its arrow | Yes, if the other side is walkable | See Gates |

The gnome start and the house are never ice, mud or a gate. Teleporter letters, bridges and rocks are unchanged.

### Ice

- When a move takes the gnome onto ice, he keeps going in the same direction, one tile at a time, while he stands on ice and the next tile can be entered (walkable, on the board, no fence on the line, and allowed by a gate's arrow).
- The slide stops on the first tile that isn't ice, or on the ice tile he's on when the next tile can't be entered. A fence across the slide's path stops him on the ice before it.
- **The whole slide is one move**, however many tiles it covers (like a teleport jump).
- Sliding onto mud stops him there and adds mud's extra move. Sliding onto a teleporter jumps him and ends the slide; he never slides out of the partner tile. Sliding onto the house reaches it.
- A move that starts on ice (he stopped there) is a normal step in any direction; if it lands on ice, a new slide starts.
- A slide crosses every line between the tiles it passes; a fence on any of them changes it.

### Mud

- Stepping onto mud costs 2 moves: 1 to step in, 1 stuck. Stepping off is a normal move.
- In the replay the stuck move is a move where he stays on the same tile.
- If his moves run out while he's stuck, he stays there (a player win, like any other "out of moves").

### Gates

- A gate tile can only be entered moving in its arrow's direction, and only left moving in that direction. `>` lets him through left to right only.
- A gate's entry and exit tiles (behind and in front of it along the arrow) must both be walkable land, never another gate, and on the board. The generator enforces it and the tests check every shipped gate, like bridges.
- A gate is not ice; a slide that enters a gate stops on it.

### Gnome tools (Hard)

- A level may carry `"tool": "ladder" | "pickaxe" | "plank"`. The UI shows it before the player places anything.
- He uses it **at most once, and only where it gives him a shorter route home**. His route is the shortest route with the tool used once or not at all. When two routes tie, he prefers the one without the tool (cosmetic, like the tie-break).
- A tool is used on a normal step he starts, never in the middle of a slide.

| Tool | The one step it allows | Cost of that step |
|---|---|---|
| Ladder | Cross one line that has a **player fence** on it (never the border) | 2 moves |
| Pickaxe | Step onto one rock tile, which becomes grass for the rest of that replay (the art shows a pickaxe on a rock, a scythe on a berry bush, which is a rock in the engine) | 2 moves |
| Plank | Step onto one river tile. His next move must step off it onto land; the plank never carries him on to another river tile | 1 move |

- After the tool step every other rule applies: landing on ice starts a slide, landing on mud adds its extra move, landing on a teleporter jumps him.
- **The no-cut rule ignores the tool.** A fence set is legal only if he has a route home without the tool. So the tool never decides whether a fence is refused.
- Par, the stored `answer` and hints are exact against the gnome using his tool.

### Route and move counting (v5)

- His route is the cheapest in moves: a step is 1, a slide is 1, a teleport is 1, mud adds 1, a ladder or pickaxe step is 2.
- Win and lose are unchanged: he wins for the player when the cheapest route costs more than the move limit, and walks until his moves run out.
- The tie-break (up, right, down, left at each choice) stays cosmetic.

### Design metrics (checked by each tier's build script)

| Metric | Target |
|---|---|
| Load-bearing | A mechanic is load-bearing on a level if swapping it for grass (tiles) or removing it (tool) changes par or makes the stored answer lose. 100% on its intro levels, at least 70% across the tier |
| Slack (move limit minus base route) | Easy 2 to 5, Medium 3 to 7, Hard 5 to 10 |
| Par answers | At most 10 on intro levels and Easy 6 to 13 |
| Density on 7x7 | Ice 3 to 8 tiles, mud 2 to 5, gates 1 to 3 |
| Solve | Every level's `solve` finishes within the build's node budget |

### Colours for the new things (rule 6 legend, added to `docs/ART_SPEC.md` with the art)

- Ice: frosted `#dff3f8`, white shine streaks, no glow.
- Mud: peat `#6b5232` (must read apart from bridge log brown `#a0703f`).
- Gate: stone grey `#9aa3a6` arch, cream `#fff6e0` arrow. Not timber (timber is a player fence).
- Tools are props the gnome carries; none uses hat red, timber, gold, the teleporter glows or lime.

## Daily level

- A separate mode: one 9x9 level per calendar day, the same for everyone on that date.
- The day is the player's **local** date.
- Daily levels are generated offline in a batch (180 days) into `assets/levels/daily.json`, each verified like pack levels. Rules v4, 9x9, par 4 to 5 on weekdays and par 6 on Sundays (a weekly hard day). A single par answer is not required.
- If today's date is outside the batch, the page says the daily is taking a break instead of erroring.
- Best stars per date are saved like pack progress.
- **Standalone daily (27 Oct):** the daily also ships as its own page, `/daily/` (Easy and Hard, 5 tries a day, scored out of 100, a hint that costs 15 points, streaks, stats, sharing). Its rules live in `docs/DAILY_SPEC.md` ("Current rules"); they are not repeated here.

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
