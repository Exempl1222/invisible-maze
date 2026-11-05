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
| 6b | **v4 rollout** | Rules v4 everywhere: 5x5 tutorial, bridges that span a river, new 30-level pack (par up to 7), 180-day daily with weekday par, home page and copy updated | Builder (Opus) | Done (merged) |
| 6c | **Standalone daily** | `/daily/` page per `docs/DAILY_SPEC.md`: 3 tries, 1 hint a day, streak and stats, share, countdown, how-to-play, app link behind a flag. Unit and browser tests green, playtested on phone | Builder (Sonnet), reviewed by Opus | Done 28 Oct 2026 |
| 6d | **Daily v2: Easy + Hard, score /100** | `docs/DAILY_SPEC.md` v2: Easy 7x7 (`daily-easy.json`, built by `build-daily.js --size 7`) and Hard 9x9, no fence limit, 3 tries with Retry or Submit, best-of-3 score out of 100, hint -15, per-mode streaks and stats, v1 saves migrate into Hard. Unit and browser tests green, playtested on phone | Builder (Sonnet), reviewed by Opus | Done 28 Oct 2026 |
| 6e | **CI-only archive hang** | Root cause: CI's Playwright 1.56 ignored `test.use({ reducedMotion })`, so the gnome's walk animated on the test's fake clock, and a 9x9 walk (~4s) outlasted the 1s the tests advanced. Not an app bug; Eric confirmed the path on a real phone. Fix: tests set reduced motion on the page, advance 8s, and assert reduced motion is on. All archive tests un-skipped | Investigator (Sonnet), verified by Opus | Done 28 Oct 2026 |
| 6f | **Optimal solution button** | `DAILY_SPEC.md` v3: after the day is done, show and replay the par answer; par revealed only there. Tests green | Builder (Sonnet), reviewed by Opus | Done (merged) |
| 6h | **Sir Croakwell** | `docs/VILLAIN_SPEC.md`: toad wizard villain under the board (idle, cast, gloat, sulk), lime fence magic on placed fences, face-on on the home hero and in How to play, Easy and Hard buttons on home, Daily links in the nav and on the Play Daily tab. Follow-up: remove the old in-page daily code on the Play page | Builder (Sonnet), reviewed by Opus | Done (merged) |
| 6i | **Daily v3.1: 5 tries** | Daily (Easy and Hard) gives 5 tries a day instead of 3: `MAX_TRIES = 5`, five pips, copy, Worker validation (`tries` 1 to 5; legacy 3-try lost days still accepted), saved records keep their state. `DAILY_SPEC.md` v3.1 note. Unit and browser tests green | Builder (Sonnet), reviewed by Opus | Done (merged) |
| 6g | **Everyone's scores** | `DAILY_SPEC.md` v3: Cloudflare Worker + D1 re-checks fences and scores; page shows the score spread and 'You beat X%'. Off until deployed | Builder (Sonnet), reviewed by Opus | Done (merged) |
| 6j | **Score card share and the custom domain** | `DAILY_SPEC.md` v3.2: 1080x1080 score card PNG drawn on a canvas (`card.js`, `card-draw.js`), shared as a file with the text, Save image on the copy path, link-preview image built by `npm run build:og`, `gnomesweetgnome.app` meta and Worker CORS. Unit and browser tests green | Builder (Sonnet), reviewed by Opus | Done (merged) |
| 6k | **Review fixes (Nov)** | Independent review found 19 findings at `b0b72c0` (verdict: not ready). Fixes on `fix/review-nov`: answers off the page (`DAILY_SPEC` v3.4), midnight streak rule, Worker date window, legacy shape cutover, Turnstile (built, off), Worker always deploys, `?v=` stamping, docs drift, `REVIEW_CONTEXT.md` | Builders (Sonnet), reviewed by Opus | In review |
| 6 | **Polish and launch** | Daily level, packs of 30, hints, final name, analytics, custom domain, then ads | Mixed | Not started |
| 7 | **Gnome retheme** | sprites in game, menus rethemed | Builder (Sonnet), reviewed by Opus | In review |

## Why this order

- **Site before game** means the deploy pipeline, tests and hosting are proven while the stakes are low. Every later phase just adds files.
- **Rules before engine** because the rules decide what the engine must check. v2 needs an exact par solver, because stars depend on it.
- **Engine before UI** so the hardest bugs (a wrong par, a level with no answer, a robot that ignores a teleporter) are caught by tests, not by players.
