# Game spec v2 (locked 24 Oct 2026)

Source of truth for game logic. If something isn't answered here, stop and ask; don't invent rules. Changes go through a PR that edits this file first.

v1 (hidden walls and Picross clues) is retired. Hidden walls turned the puzzle into guessing, and on a plain grid par never went above 4.

## Concept

A robot wants to reach the beacon and always takes the shortest route. Before it moves, you place walls, all in one go, to stop it reaching the beacon within its move limit. Use as few walls as you can.

## Core rules

| Rule | Decision |
|---|---|
| Robot movement | One step per move: up, down, left or right. Never diagonal. |
| Robot route | Always a shortest route to the beacon given the board after your walls. |
| Tie-break | If several routes are equally short, the robot prefers up, right, down, left at each step. Cosmetic only: it never changes win or lose. |
| Turn order | Place every wall, press Go, watch. No changes once Go is pressed. |
| Win | No route to the beacon, or the shortest route is longer than the move limit. |
| Lose | The robot reaches the beacon within the move limit. |
| Robot with no route | Stays put and shows a stuck animation. That's a win. |
| Robot with a route that's too long | Walks its shortest route until it runs out of moves, then stops. That's a win. |
| Wall budget | Set per level. The UI won't let you place more. |
| Score | Par = fewest walls that win, computed exactly by the engine. 3 stars at par, 2 at par + 1, 1 at anything else within budget. |
| Retries | Unlimited. No lives. |

## Tiles

| Tile | Symbol | Robot can walk on it | You can wall it |
|---|---|---|---|
| Grass | `.` | Yes | Yes (the only buildable tile) |
| Rock | `#` | No | n/a (pre-built, permanent) |
| River | `~` | No | No |
| Bridge | `=` | Yes | No |
| Teleporter | `T` (pairs share a letter in level data) | Yes | No |
| Robot start | `R` | Yes | No |
| Beacon | `B` | Yes | No |

**Teleporters:** stepping onto one moves the robot straight to its partner. Forced (the robot can't step on without travelling), two-way, and the whole jump counts as one move. The robot then continues from the partner tile. Walking onto the partner tile directly also teleports it back.

**v1 ships with these tiles only.** New tiles (mud, one-way conveyors, gates) arrive one per level pack, each through a spec change.

## Grids and levels

| Size | Use |
|---|---|
| 5x5 | Tutorial (first 5 levels, one new idea each) |
| 7x7 | Main levels |
| 9x9 | Hard levels and the daily |

- **Level supply:** one curated daily level plus packs of 30.
- **Levels are generated offline and curated**, not made on the phone. The prototype found about 8% of random 9x9 terrain levels reach par 3 or more, and about 1 in 200 has par 3 or more with exactly one answer.
- **The daily level must have exactly one par answer.** Pack levels may have more, tagged by count.

## Hints and ads

- A hint reveals one wall from a par answer.
- Hints are earned by watching an ad, after launch. No ads until Phase 6.

## Engine guarantees (Phase 3)

- `solve(level)` returns par and one par answer. Exact, exhaustive search.
- `countAnswers(level, k)` returns how many k-wall answers exist (capped).
- `simulate(level, walls)` returns the robot's step-by-step route (including teleports), the result (win or lose), and moves used.
- Every shipped level has an answer within budget, and budget is at least par.
- Levels are reproducible from a seed. The engine is pure JS with no DOM.

## Level data format

```json
{
  "id": "d-2026-10-24",
  "size": 9,
  "tiles": [
    ".....=~..",
    "......~..",
    "..R...~..",
    "......=..",
    "...#..~..",
    "......=..",
    "......=..",
    "...#..~~B",
    "a...#..~a"
  ],
  "moveLimit": 13,
  "wallBudget": 4,
  "par": 3,
  "parAnswers": 1
}
```

Teleporter pairs use matching lowercase letters (`a` with `a`, `b` with `b`). Coordinates are `[x, y]` from the top left. This level is the one in the landing-page replay (par answer: `[8,6]`, `[0,7]`, `[1,8]`).
