# Roadmap

The site goes live first and stays live. Each phase ships on its own, so there is always a working website and the game slots in behind it.

| Phase | Parcel | Done when | Who | Status |
|---|---|---|---|---|
| 1 | **Website live** | Landing page and Play placeholder auto-deploy from `main` to GitHub Pages, with smoke tests gating every deploy | Orchestrator (Opus) | Done 24 Oct 2026 |
| 2 | **Rules locked** | `docs/GAME_SPEC.md` answers every open question (v2: shortest-path robot, terrain, par scoring) | Eric decides, Planner drafts (Opus) | Done 24 Oct 2026 |
| 3 | **Puzzle engine** | Pure JS in `src/game/`: level parser, shortest path with teleporters, `simulate`, exact `solve` (par), `countAnswers`, plus an offline generator script that keeps only good levels. Seeded. Tests first, all green | Builder (Sonnet) | Done 25 Oct 2026 |
| 4 | **Playable build** | `/play/` runs one full level on a phone, start to win or lose | Builder (Sonnet) + frontend-design | Done 25 Oct 2026 |
| 5 | **Playtest loop** | A fresh agent plays 20 seeded levels with the maze-playtest skill and reports bugs and dead ends | QA agent (Sonnet, no prior context) | Done 25 Oct 2026: found the cage shortcut, hidden par, unreadable teleporters |
| 5a | **Rules v3: engine and levels** | Line walls with the guard rule in the engine, generator and a new 30-level pack (7x7 tutorial, no 5x5), 120-day daily batch. Every level brute-force verified | Builder (Sonnet), verified by Opus | Done 26 Oct 2026 |
| 5b | **Rules v3: game screen** | Tap-to-line walls, par shown upfront, readable teleporters, trapped animation, start marker, all levels open, Daily mode, home-page replay redrawn | Builder (Sonnet) + frontend-design | Done 26 Oct 2026 |
| 5c | **Rules v3.1: no cutting every route** | Engine refuses walls that leave no route; solver, generator, pack and daily rebuilt (every win is out of moves); UI refusal message and copy. Independently re-verified | Builder (Sonnet), verified by Opus | Done 26 Oct 2026 |
| 6a | **Lab v4 rules + hints** | Engine `rules` per level (`v3.1` default, `v4` lab) with the two-sides cap, 5-level Lab tab, hints on every level (inventory, earned from the daily, each hint costs a star), stored `answer` on every level | Builder (Sonnet) | Done 26 Oct 2026 |
| 6b | **v4 rollout** | Rules v4 everywhere: 5x5 tutorial, bridges that span a river, new 30-level pack (par up to 7), 180-day daily with weekday par, home page and copy updated | Builder (Opus) | In review |
| 6c | **Standalone daily** | `/daily/` page per `docs/DAILY_SPEC.md`: 3 tries, 1 hint a day, streak and stats, share, countdown, how-to-play, app link behind a flag. Unit and browser tests green, playtested on phone | Builder (Sonnet), reviewed by Opus | In review |
| 6d | **Daily v2: Easy + Hard, score /100** | `docs/DAILY_SPEC.md` v2: Easy 7x7 (`daily-easy.json`, built by `build-daily.js --size 7`) and Hard 9x9, no fence limit, 3 tries with Retry or Submit, best-of-3 score out of 100, hint -15, per-mode streaks and stats, v1 saves migrate into Hard. Unit and browser tests green, playtested on phone | Builder (Sonnet), reviewed by Opus | In review |
| 6e | **CI-only archive hang** | Find why, on CI only (Playwright 1.56 Chromium), today's Hard try right after an archive day on the same page loses with the stored answer and the walk never settles. Un-skip the three `test.fixme` archive tests. Confirm on the live site whether players can hit it | Investigator (Sonnet) | Open |
| 6 | **Polish and launch** | Daily level, packs of 30, hints, final name, analytics, custom domain, then ads | Mixed | Not started |
| 7 | **Gnome retheme** | sprites in game, menus rethemed | Builder (Sonnet), reviewed by Opus | In review |

## Why this order

- **Site before game** means the deploy pipeline, tests and hosting are proven while the stakes are low. Every later phase just adds files.
- **Rules before engine** because the rules decide what the engine must check. v2 needs an exact par solver, because stars depend on it.
- **Engine before UI** so the hardest bugs (a wrong par, a level with no answer, a robot that ignores a teleporter) are caught by tests, not by players.
