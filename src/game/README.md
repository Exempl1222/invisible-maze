# src/game

The puzzle engine lives here (Phase 3). Rules for this folder:

- Pure JavaScript ES modules. No DOM, no `window`, no timers. The UI imports from here; nothing here imports from the UI.
- Every module ships with a `*.test.js` beside it, run by `node --test "src/**/*.test.js"`.
- Tests come first. For the level generator, the first test is "every generated level is solvable", checked by brute force on small grids.
- Randomness takes a seed, so any bug a player hits can be replayed exactly.

Empty until the rules in `docs/GAME_SPEC.md` are locked.
