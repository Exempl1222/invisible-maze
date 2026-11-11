# Review context: Gnome Sweet Gnome daily

Kept current with the code. Any change to a game rule, daily rule, scope or deploy setup updates this file in the same PR (see CLAUDE.md). Rules detail: `docs/GAME_SPEC.md`, `docs/DAILY_SPEC.md` ("Current rules").

## Purpose and users
Daily fence-building puzzle at gnomesweetgnome.app. Players place fences on grid lines to make a runaway gnome take the longest detour home. Mostly played on phones, shared with friends via a score card link.

## Scope for this check (in / out)
**In:** daily page and game logic, puzzle generation and seeding, solver and par, scoring, tries and hints, Easy/Hard streaks and stats, 30-day archive, share text and score card, Cloudflare Worker + D1 (score submission, server-side fence re-check, score spread stats; deployed but switched off), CI, GitHub Pages and custom domain, all notes and decision docs.
**Out:** full app levels and lab levels, except shared code the daily depends on. Play rules v5 (Easy / Medium / Hard tiers, ice, mud, gates, gnome tools; `docs/GAME_SPEC.md` "Rules v5") are Play-only and out of scope here, except that the shared engine must keep v4 levels (the daily) behaving exactly as before. The "Can you beat it?" banner is planned, not built (specced on branch `feat/beat-friend`); do not report it as missing.

## Stated rules and invariants
- Gnome takes the shortest path home. Fences sit on grid lines between tiles.
- The player can never block every route; the gnome must always have a way home.
- Rules v4: a fence can go on any line whose two tiles are both walkable (grass, bridge, teleporter, gnome start, house). Fences are allowed next to bridges and stumps. A line touching a river or rock tile can't be fenced (`lineBuildable`), and the outer border is already a wall. At most 2 sides of the gnome and 2 sides of his house can be fenced. Teleporters are paired hollow stumps; a jump crosses no line.
- Easy is 7x7, Hard is 9x9, with separate streaks and stats.
- The daily is rules v4 only. v5 tiles (`*` ice, `&` mud, `> < ^ v` gates) and the `tool` field are rejected on any level not marked `"rules": "v5"`, so they can't reach a daily.
- No fence limit. Par is not shown during play. The answer is never shipped: the daily JSON has no `answer`, and the browser solver (`solve(level, { exactPar })` in a module worker) computes hint and solution on demand. Par IS in the data by accepted design.
- 5 tries a day (`MAX_TRIES`), best try counts. Score out of 100: par = 100, down to 30 at 3x par. 5 losses = 0. Hint costs 15 points (no free hint), floor 15 on a hinted win.
- Streak: a won day counts if finished on its own date, or if the page opened it as the player's today (`startedOn`, the load-time date) and it was finished by the end of the next day. Archive catch-ups never count.
- Archive covers the last 30 days (today plus 29). Future dates show "not ready".
- "See optimal solution" only appears once the day is done.
- The Worker re-checks every submitted fence layout and computes the score itself; client scores are never trusted. Date window: UTC-12 minus 6 hours to UTC+14.
- Stats are switched off: `STATS_URL` is `null`, nothing is sent or shown. Turnstile is built but off (`TURNSTILE_SITE_KEY` null, no secret).
- The Worker always deploys on pushes to `main` (no change filter) when the Cloudflare secrets exist. The Pages deploy stamps `?v=<commit>` on own assets and the daily page reloads once on a failed module load or link error (the reload guard checks the `window.__gsgBooted` flag that `main.js` sets).
- Days from 2026-11-08 were remade with no answer ever in git or the page (`DAILY_REFRESH`); 27 Oct to 7 Nov keep their old layouts, whose answers sit in git history (every player had reached those days by the merge). A hash test pins them.
- Hint and solution run `solve(level, { exactPar })` in a worker; the generator rejects days over `SOLVE_NODE_BUDGET` (50000 nodes, about 0.9 s in Node). A finished day's answer is cached in localStorage (`answer-cache.js`); the hint never stores it.
- Time: `startedOn` is set from the date the page loaded with (`realToday`), so a first try just after midnight still counts as begun on the puzzle's day; a begun-on-the-day finish counts until the end of the next local day. A finish late on that next day can keep the streak but fall outside the Worker's posting window, so it is not posted (accepted).
- The Worker also requires the Turnstile token's `hostname` to be `gnomesweetgnome.app`. CI smoke-tests the stamped site (`tools/collect-site.sh`, `playwright.site.config.js`). `TURNSTILE_SECRET` is in the env of one deploy step only.
- Shared links always bring people back to the main site to play. `play/?daily` redirects to `daily/`.

## Known and accepted limits (do not re-report)
- Par is derivable with the bundled solver; the answer itself is not shipped.
- Any day's answer can be computed in seconds from the public layout with the bundled solver (for example by posting to `solver-worker.js` in devtools). The goal is that it is never handed over, not that it cannot be found. Nothing client-side can stop a determined player.
- A player can read a finished day's cached answer in their own localStorage; it is stored only after the day is done.
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
4 Nov 2026 at `b0b72c0`. Verdict: not ready (19 findings). Fixes are on `fix/review-nov`. Second review of that branch at `b08aa97` (5 Nov): merge with fixes (N1 to N9), addressed in the follow-up commits.
