# Game spec (draft, not locked)

Status: **open**. Phase 3 does not start until every question below has an answer.

## Concept

A grid maze with hidden walls, a robot and a portal. Edge clues (Picross style) give the number of walls in each row and column. The robot has a sensor that reads its distance to the portal.

## Modes

| | Classic | Flipped (front-runner) |
|---|---|---|
| Player role | Guide the robot to the portal | Place walls so the robot can't reach the portal |
| Robot | Player-controlled | Moves on its own, limited number of moves |
| Win | Reach the portal | Robot runs out of moves |
| Lose | Out of lives (bumps) | Robot reaches the portal |

## Open questions

1. **Mode:** flipped only, or classic as a tutorial?
2. **Robot brain (flipped):** shortest path every turn, a fixed rule (always turn right), or something the player can learn and exploit?
3. **What's hidden in flipped mode?** Pre-existing walls the player can't see, plus walls the player places?
4. **Wall budget:** how many walls can the player place per level?
5. **Turn order:** place all walls then watch, or alternate (place one, robot moves one)?
6. **Where do the edge clues count?** Hidden walls only, or hidden plus placed?
7. **Distance sensor:** straight-line, grid steps ignoring walls, or true path length?
8. **Grid sizes** by difficulty (e.g. 5x5 to 9x9)?
9. **Lives, hints and ads:** what costs a life, what a hint reveals, when an ad is offered.
10. **Level supply:** hand-built set, daily seed, or endless generator?

## Engine guarantees (any mode)

- Every level is solvable, verified by brute force on small grids.
- No level is solvable by a trivial move (filters out boring levels).
- Levels are reproducible from a seed.
