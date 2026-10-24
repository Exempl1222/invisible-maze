# Roadmap

The site goes live first and stays live. Each phase ships on its own, so there is always a working website and the game slots in behind it.

| Phase | Parcel | Done when | Who | Status |
|---|---|---|---|---|
| 1 | **Website live** | Landing page and Play placeholder auto-deploy from `main` to GitHub Pages, with smoke tests gating every deploy | Orchestrator (Opus) | Done 24 Oct 2026 |
| 2 | **Rules locked** | `docs/GAME_SPEC.md` answers every open question; mode chosen (flipped is the front-runner) | Eric decides, Planner drafts (Opus) | In progress |
| 3 | **Puzzle engine** | Pure JS in `src/game/`: grid, robot movement, clue generation, level generator, solvability checker. Seeded. Tests first, all green | Builder (Sonnet) | Not started |
| 4 | **Playable build** | `/play/` runs one full level on a phone, start to win or lose | Builder (Sonnet) + frontend-design | Not started |
| 5 | **Playtest loop** | A fresh agent plays 20 seeded levels with the maze-playtest skill and reports bugs and dead ends | QA agent (Sonnet, no prior context) | Not started |
| 6 | **Polish and launch** | Sound, level progression, lives and hints, analytics, custom domain, then ads | Mixed | Not started |

## Why this order

- **Site before game** means the deploy pipeline, tests and hosting are proven while the stakes are low. Every later phase just adds files.
- **Rules before engine** because the flipped mode changes what the engine must check (can the player always trap the robot, and only just).
- **Engine before UI** so the hardest bug (unsolvable or trivially solvable levels) is caught by tests, not by players.
