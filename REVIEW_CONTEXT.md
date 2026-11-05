# Review context: Gnome Sweet Gnome daily

Kept current with the code. Any change to a game rule, daily rule, scope or deploy setup updates this file in the same PR (see CLAUDE.md). Rules detail: `docs/GAME_SPEC.md`, `docs/DAILY_SPEC.md` ("Current rules").

## Purpose and users
Daily fence-building puzzle at gnomesweetgnome.app. Players place fences on grid lines to make a runaway gnome take the longest detour home. Mostly played on phones, shared with friends via a score card link.

## Scope for this check (in / out)
**In:** daily page and game logic, puzzle generation and seeding, solver and par, scoring, tries and hints, Easy/Hard streaks and stats, 30-day archive, share text and score card, Cloudflare Worker + D1 (score submission, server-side fence re-check, score spread stats; deployed but switched off), CI, GitHub Pages and custom domain, all notes and decision docs.
**Out:** full app levels and lab levels, except shared code the daily depends on. The "Can you beat it?" banner is planned, not built (specced on branch `feat/beat-friend`); do not report it as missing.

## Stated rules and invariants
- Gnome takes the shortest path home. Fences sit on grid lines between tiles.
- The player can never block every route; the gnome must always have a way home.
- Rules v4: a fence can go on any line whose two tiles are both walkable (grass, bridge, teleporter, gnome start, house). Fences are allowed next to bridges and stumps. A line touching a river or rock tile can't be fenced (`lineBuildable`), and the outer border is already a wall. At most 2 sides of the gnome and 2 sides of his house can be fenced. Teleporters are paired hollow stumps; a jump crosses no line.
- Easy is 7x7, Hard is 9x9, with separate streaks and stats.
- No fence limit. Par is not shown during play. The answer is never shipped: the daily JSON has no `answer`, and the browser solver (`solve(level, { exactPar })` in a module worker) computes hint and solution on demand. Par IS in the data by accepted design.
- 5 tries a day (`MAX_TRIES`), best try counts. Score out of 100: par = 100, down to 30 at 3x par. 5 losses = 0. Hint costs 15 points (no free hint), floor 15 on a hinted win.
- Streak: a won day counts if finished on its own date, or if its first try was spent on that date (`startedOn`) and it was finished by the end of the next day. Archive catch-ups never count.
- Archive covers the last 30 days (today plus 29). Future dates show "not ready".
- "See optimal solution" only appears once the day is done.
- The Worker re-checks every submitted fence layout and computes the score itself; client scores are never trusted. Date window: UTC-12 minus 6 hours to UTC+14.
- Stats are switched off: `STATS_URL` is `null`, nothing is sent or shown. Turnstile is built but off (`TURNSTILE_SITE_KEY` null, no secret).
- The Worker always deploys on pushes to `main` (no change filter) when the Cloudflare secrets exist. The Pages deploy stamps `?v=<commit>` on own assets and the daily page reloads once on a failed module load.
- Shared links always bring people back to the main site to play. `play/?daily` redirects to `daily/`.

## Known and accepted limits (do not re-report)
- Par is derivable with the bundled solver; the answer itself is not shipped.
- Future days' layouts are in the public repo and level files.
- Streaks and stats live only in the player's localStorage (lost on clearing site data).
- A player can change their device clock (affects only themselves, and the Worker's date window bounds what it can post).
- The `hint` flag and `tries` in a stats post are the client's word.

## Risk hotspots
- Which timezone defines "today", and whether everyone gets the same puzzle.
- Answer leaking through client code, data files or network calls before the day is done.
- Fake or replayed score submissions skewing everyone's stats (matters once stats are switched on).
- Streaks breaking at midnight, DST, after archive play, or with cleared storage.
- Rules duplicated between client and Worker drifting apart.
- Cache serving an old build after deploy; docs drifting from code.

## Deploy surface
GitHub repo invisible-maze, GitHub Pages, custom domain gnomesweetgnome.app, Cloudflare Worker + D1 (https://gnome-sweet-gnome-stats.gaoeric1234567890.workers.dev), GitHub Actions CI.

## Severity anchors
- **Critical:** wrong score or par, lost or wrong streak, answer leaked before finishing, gnome left with no route home. Cheatable or corruptible stats are Critical only once stats are switched on (`STATS_URL` set); while off, High at most.
- **High:** breaks on a common phone, share link fails to open the game, archive or today's puzzle won't load.
- **Medium:** edge-case timing bugs, client/Worker rule duplication, stale notes.
- **Low:** visual polish, toad layout tweaks, copy.

## Lens-specific questions
- Time: same puzzle at 11pm in Sydney and 11pm in London on "the same day"?
- Trust: can the solution be found in devtools before the day is done?
- Structure: is there one implementation of the pathfinding and scoring rules, or two?

## Last reviewed
4 Nov 2026 at `b0b72c0`. Verdict: not ready (19 findings). Fixes are on `fix/review-nov`.
