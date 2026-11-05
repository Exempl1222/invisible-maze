# Standalone daily spec

The daily as its own page, so it can ship alone with a link to the full game later. Decided by Eric, 27 Oct 2026. Game rules are in `docs/GAME_SPEC.md` (rules v4); this spec covers what is built around them. **"Current rules" is the one section to trust.** "History" below it only records how we got here; where it disagrees with "Current rules", "Current rules" wins (and the code wins over both).

## Current rules (as of 5 Nov 2026)

### Two dailies, one day number
- **Easy:** 7x7, `assets/levels/daily-easy.json`, par 3 Monday to Saturday, par 4 Sunday (`node tools/build-daily.js --size 7`).
- **Hard:** 9x9, `assets/levels/daily.json`, par 4 Monday to Wednesday, 5 Thursday to Saturday, 6 Sunday.
- Both start 2026-10-27, 180 days, rules v4, `wallBudget = par + 2`. Day number `#N` = index + 1 (27 Oct 2026 is #1), shared by both modes.
- Tabs `Easy | Hard`; `?mode=easy|hard`. With no mode in the URL the page opens the mode last chosen, Easy on a first visit. Each mode has its own record per date, hint, streak and stats.
- The weekday is taken from the date string in UTC, so every timezone gets the same puzzle for the same date.

### Play
- **No fence limit** (the page gives the engine a budget equal to the number of buildable lines). Still refused: cutting every route, more than 2 sides of the gnome or of his house, unbuildable lines. Fences may go next to bridges and teleporters (see `GAME_SPEC.md`).
- Shown: `Fences` (count), `Move limit`, `Moves left`, `Best` (best score today, `-` before a win). **Par is never shown during play**, and nothing reveals the answer, including on a lost day.
- Buttons: **Try** (sends the gnome), **Reset** (removes the player's fences; a hint fence stays), **Hint**.
- **5 tries a day** (`MAX_TRIES` in `assets/js/daily/config.js`, the one source for the page, the saved-record cap and the Worker). Every Try spends one, win or lose, and a reload never gives one back.
  - Win: the try's score shows; buttons `Retry for a better score (N left)` (keeps the fences) and `Submit`. Submit ends the day. When a try can't be beaten (100, or 85 with the hint), Submit is the only button.
  - Loss: `He made it home`; with tries left, `Try again (N left)`, fences stay.
  - After the fifth try the day ends on its own. Done is done: the board locks and a reload shows the finished state.
- **Best try counts.** Day score = the best winning try. No win = 0.
- **Score:** `max(30, round(100 - 70 * (fences - par) / (2 * par)))`. Par scores 100, 3x par or more scores 30. Fences can't be fewer than par.
- **Hint:** 1 per mode per date, **costs 15 points** (`HINT_COST`; there is no free hint). It places one fence of a par answer and takes 15 off every winning try that day, with a floor: the lowest hinted win is 15 (`max(15, base - 15)`). So the best possible hinted score is 85. The button reads `Hint (-15)`, then `Hint used`.
  - The hint can't be a free answer check: if every answer fence is already down, one of the player's own answer fences becomes the hint fence and the hint is still spent. If a hint fence can't go down (side cap, or it would cut every route) the message is generic, `No room for a hint right now. Take a fence back.`, and the hint is not spent.
  - Tries are stored without the hint (`base`); the shown score is computed at read time, so the cost survives reloads and tab merges.
- **Easy levels can't be won at par using only fences on the sides of the gnome and his house** (the generator rejects those).

### Answers are not on the page (v3.4)
- The daily JSON files carry **no `answer`**. `par` and `parAnswers` (a count) are in the data by accepted design: par is needed for scoring, and a bundled solver could derive it.
- Hint and "See the optimal solution" are **solved in the browser on demand**: `assets/js/daily/solver.js` starts the module worker `solver-worker.js`, which calls `solve(level, { exactPar })` from `src/game/` (deploy copies `src/game`). Only when the player presses the button. While it works the button is disabled and `#status` says "Croakwell is thinking...". If the worker fails or takes over 20 s the page says so and the hint is not spent. The generator only keeps a remade day if `solve(level, { exactPar, maxNodes: SOLVE_NODE_BUDGET })` finishes within the budget (50000 nodes, about 0.9 s in Node on the dev machine; `tools/build-daily.js`, unit-tested for every shipped day), so a day takes under about a second on a laptop and the 20 s timeout has a wide margin on a phone. Before the budget the worst Hard Sundays took about 6 s. Once a day is **done**, the solved answer is cached in localStorage (`assets/js/daily/answer-cache.js`, key `gnome-sweet-gnome:daily:answer:<mode>:<date>`, checked against the level before use) so "See the optimal solution" after a reload does not solve again. The hint never stores anything. The engine search is deterministic, so a level always gives the same answer.
- Days from **2026-11-08** on were remade with a salted seed (`DAILY_REFRESH` in `tools/build-daily.js`), for both sizes. The original batch carried each day's answer in `assets/levels/*.json`, and that file is in the public git history; so the cutover is the first date nobody could reach when this change merged (merge expected by 7 Nov Sydney, the furthest-ahead time zone is about 10 h ahead). Days 27 Oct to 7 Nov (12 days) keep their original layouts, and their answers in history are harmless because every player has already reached them. Days from 8 Nov have layouts that never carried an answer. A hash test pins the playable fields of the 12 kept days. To remake again, change the salt and build the pieces with `--from 12`.
- `tools/build-daily.js` never writes `answer` (`withoutAnswer`). The pack and lab files keep theirs.
- **`/play/?daily` is retired:** any `?daily` on the play page goes to `../daily/`, keeping `mode` and `date`. `assets/js/play/daily.js` stays (date helpers shared with the daily page and the Worker).

### See the optimal solution
- Only once the day is done (Submitted or all 5 tries used), also on archive days. Button `See the optimal solution` under the score, toggling to `Hide the solution`.
- Solves in the browser (above), scrolls the board into view, draws the par answer in the hint (gold ribbon) style over an otherwise empty board, says `Par N: one way to fence him in with N fences.` and replays the gnome's walk (respecting reduced motion). Hiding puts the player's own fences back. It changes nothing saved. This is where par is revealed, and only here.

### Where it lives, dates, archive
- Page: `daily/index.html`, served at `/daily/` on gnomesweetgnome.app; the shared link. Code in `assets/js/daily/`. It reuses the engine (`src/game/`), `assets/js/play/board.js`, `lines.js`, `icons.js`, `daily.js` and `assets/js/sprites.js`, and must not import `assets/js/play/main.js` or `storage.js`.
- No query: plays the player's **local** date (today). `?date=YYYY-MM-DD` is the **archive**: today minus 1 to minus 29 plays for real and is saved (today's date is the same as no query). A future date shows `Not ready yet. This gnome is still packing.` with a button to today; older than the archive, or not a real date, shows `That day is out of the archive.`; outside the batch shows `The daily is taking a break.`
- **Archive dialog:** the last 30 days (today plus 29), newest first, today marked; each row shows `#N`, the date and both scores (`Easy 88 · Hard -`). Days before the batch start are left out.
- Header: wordmark (a link to the full game only when `APP_LINK.enabled`, which is `false`), `?` how to play (opens on the first visit, sets `seenHowTo`), archive and stats buttons. Countdown after the day is done (`Next gnome in 5h 12m`, to local midnight; `A new gnome is here` with `Play` after).

### Saved on the device
- Key `gnome-sweet-gnome:daily:v2`: `{ easy: { date: record }, hard: { date: record }, device, lastMode, seenHowTo }`. Record: `tries` (array of `{ fences, won, base, walls }`), `hint`, `walls` (current fences), `done`, `finishedOn`, `startedOn`, `reviewing`, `sent`. Every storage access is wrapped; memory is the fallback; corrupt data is ignored.
- Before every write, re-read storage and merge per date (longer `tries` list, `done` and `won` stay true, existing `hint` and `finishedOn` kept, earlier `startedOn` kept). The `storage` event re-renders if the day on screen changed.
- v1 records (`gnome-sweet-gnome:daily:v1`) are read once and become Hard records; v1 is then left alone. A day lost on the old 3-try cap stays finished.
- **Streaks and stats live only on the device** (localStorage). Clearing site data loses them; the page can't recover them.

### Streaks and stats (per mode)
- **A day counts** when it is won (score above 0) **and** played on its own date: `finishedOn` equals the date, or `startedOn` equals the date and the day was finished by the end of the next calendar day (`countsOnDay` in `record.js`). `startedOn` is set when the first try is spent on a puzzle that **the page opened as its today** (the date read when the page loaded, `realToday` in `main.js`, `startedOnFor` in `record.js`), even if that first try lands just after midnight. So a page opened at 23:50 whose first try is at 00:01 still records the puzzle date. An archive day begun later has no `startedOn` and never counts; an older save without the field behaves as before. **The one-day limit is the rule** (decided 5 Nov): a started-on-the-day finish counts until the end of the next local day. **Known gap (N4):** a finish late on that next day can keep the streak but may fall outside the Worker's posting window (UTC-12 minus 6 h, `window.js`), so the result is not posted to the stats. The streak is local and does not depend on the post.
- **Current streak:** consecutive counting days ending today, or yesterday if today isn't done yet. A lost or missed day ends it; archive catch-ups don't repair it. **Best streak:** longest run ever.
- **Stats dialog** (Easy | Hard tabs): played, win %, average score, best score, current and best streak, and bars for 100, 80 to 99, 60 to 79, 30 to 59, 1 to 29, 0. Archive plays count in played, win % and the bars, not in streaks.
- Streak logic is pure and unit tested (dates in, numbers out).

### Share and score card
- Share text (pure function, unit tested):
  ```
  Gnome Sweet Gnome #1 Hard 🍄
  82/100 💡
  🟥🟩🟩
  https://gnomesweetgnome.app/daily/?mode=hard
  ```
  One square per try used: 🟥 loss, 🟩 win. ` 💡` only if the hint was used. Lost day: `0/100 🏠`. Archive days keep `(archive)` after the number. A line `Beat X% of players` is added when stats show it.
- **Score card:** a 1080x1080 PNG drawn on a `<canvas>` (`card-draw.js`), laid out by the pure, unit-tested `cardModel({ number, mode, score, tries, hint, archive, beat, streak })` in `card.js`. **No board, no fences** (a spoiler). Wordmark; `#N Easy|Hard` (plus `(archive)`); the score large with a drawn bulb if the hint was used; one rounded square per try (win `#3f7a34`, loss `#c94a32`); one caption (100 `Fenced in perfectly.`, 1 to 99 `Fenced in.`, 0 `He made it home.`); `Beat X% of players` only when the share text has it; a drawn flame with `N-day streak` when the mode's streak is 2 or more (not on archive days); Sir Croakwell bottom right (`toad-front-smug.svg` on a 0, `toad-front-point.svg` otherwise); footer `gnomesweetgnome.app`. Fonts Grandstander and Nunito. Drawn once when the result shows (and redrawn if it changes) so a tap on Share never waits.
- **Share button:** `navigator.share({ files, text })` if `canShare` allows the file (`gnome-sweet-gnome-<N>-<mode>.png`); else `navigator.share({ text })`; else copy the text, say `Copied`, and show `Save image`. `AbortError` does nothing; other errors fall through to the next step.
- **Link previews:** `og:url` `https://gnomesweetgnome.app/daily/`, `og:image` `assets/og/daily.png` (1200x630, generated by `npm run build:og`, never hand-edited). The share link comes from `location.href`.

### Everyone's scores: the Worker (built and deployed, switched off on the page)
- **Switch:** `STATS_URL` in `assets/js/daily/config.js` is **`null`**: nothing is sent and nothing is shown. The Worker is deployed at `https://gnome-sweet-gnome-stats.gaoeric1234567890.workers.dev` but unused until `STATS_URL` is set. Setup and the safe order of steps are in `worker/README.md`.
- **Code:** `worker/src/index.js` is the entry, `worker/src/handle.js` the pure handler (with `store.js`, `levels.js`), `worker/schema.sql`, `worker/wrangler.toml`. It imports the engine from `src/game/`, the level files and the shared `config.js`, `judge.js` and `window.js`, so server and site always agree. Tests: `tools/worker-*.test.js` against an in-memory fake of D1.
- **What the page sends** (once per device, mode and date, only for a day finished on its own date; archive plays never):
  ```
  POST {STATS_URL}/result
  { "device": "<random id>", "mode": "easy|hard", "date": "YYYY-MM-DD", "fences": [[x,y,"D"], ...] | null, "hint": true|false, "tries": 1..5, "turnstile": "<token>" (only when Turnstile is on) }
  ```
  `fences` is the best winning try's fences, or `null` for a day with no win. On failure the record keeps `sent: false` and the page retries on a later load.
- **What the Worker does:** loads the level from its own bundled copy of the daily files; re-checks the fences with the engine (buildable, no duplicates, at least one route, side cap, a win), else 400; computes the score itself (par from the level, hint from the request; the hint only lowers a score; `fences: null` scores 0). One row per (device, mode, date); a repeat is ignored (200, `duplicate: true`). No IP or personal data stored. Limits: body cap 8 KB (413), Workers Rate Limiting binding on `POST /result` (10 a minute per caller address, 429; none locally). `GET /stats` reads pre-counted `counts` rows (kept by an AFTER INSERT trigger) with `Cache-Control: public, max-age=60`.
- **Date window:** a post is accepted only for a date from the local date at UTC-12 minus a 6 hour grace (so a finish after midnight still posts) up to the local date at UTC+14. In `assets/js/daily/window.js`, shared by the Worker and the page, so the page never retries a day the server refuses.
- **No-win shape:** `fences: null` is accepted with `tries: 5`; with `tries: 3` only for dates before `FIVE_TRIES_FROM` (`2026-11-04`, `config.js`), because v3.1 went live on 3 Nov.
- **Page side:** only a 400 settles a result as refused for good; 403, 404, 413, 429, 503 and other 5xx retry on a later load, while the date is still in the window. `You beat X%` counts the player only when the send succeeded; `/stats` is fetched with `cache: 'no-cache'` right after a send.
- **Bot protection (Cloudflare Turnstile): built, off.** `TURNSTILE_SITE_KEY` in `config.js` is `null`: no external script loads and nothing changes. When set, the page loads Cloudflare's script only when about to send, adds the token as `turnstile`, and sends nothing if there is no token (as if the Worker were down; play is never blocked). When the Worker has a `TURNSTILE_SECRET` it verifies the token with siteverify before writing: missing or refused is 403, Cloudflare unreachable is 503 (the page retries). No secret, no check.
- **Accepted limits:** the `hint` flag and `tries` are the client's word (a player could drop the hint for +15); a script with many IPs and device ids can still add rows; stats are for fun, not a leaderboard with prizes.
- CORS: `https://gnomesweetgnome.app` (and `www.`), the old `https://exempl1222.github.io`, and `http://localhost:4173` (and the test port).
- **What the page shows** in the result panel once the day is done (today only; archive days say `Player stats are kept for each day's own date only.`): six score bars with the player's band highlighted and `N players today`; `You beat X% of players` (share of other players with a lower score, rounded down) only when at least 10 have posted, else `Only N players so far. Check back later.`; if stats can't load, `Player stats are taking a break.` and the rest is unaffected. `GET {STATS_URL}/stats?mode=easy&date=YYYY-MM-DD` returns `{ players, bands: { "100": n, "80-99": n, "60-79": n, "30-59": n, "1-29": n, "0": n }, scores: { "<score>": n } }`.

### Deploy
- The Pages deploy collects the site into `_site` (including `daily/` and a copy of `src/game/`) and runs `node tools/stamp-version.mjs _site "$GITHUB_SHA"`, which appends `?v=<first 8 of the commit>` to every relative reference to our own `.js`, `.json` and `.css` (script and link tags, static and dynamic imports, `new URL(..., import.meta.url)`, string constants such as `LEVEL_URL`). External and root-relative URLs are untouched; running it twice changes nothing. Locally there is no build step.
- If a module fails to load on the daily page (old and new files mixed during a deploy), `reload-guard.js` reloads the page once (a `sessionStorage` flag stops any loop).
- **The Worker always deploys:** the `worker` job runs on every push to `main` and every manual run, after the tests pass, when the Cloudflare secrets exist (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; otherwise skipped). It also sets `TURNSTILE_SECRET` on the Worker when that GitHub secret is non-empty. There is no change filter. Pull requests never deploy.

### Planned, not built
- **"Can you beat it?" landing banner** (a friend's shared link opens the daily with a banner to beat their score). Specced on branch `feat/beat-friend` (v3.3) and **not built**; it is not on `main`.
- A personalised link preview (`I scored 82 on today's Hard`) served by the Worker.
- Named leaderboards; the app link on (`APP_LINK.enabled`).

## History

Condensed. Each entry lists what it added and what it later lost.

- **v1 (27 Oct): one daily, 3 tries, stars.** One 9x9 puzzle a day, scored in stars (3 at par, 2 at par + 1, 1 otherwise, hint cost 1 star), a free hint a day, lost day shows the answer, wall budget, one shared streak, share with star line. **Superseded by v2** for scoring, tries, hint, answer reveal and streaks. Still true from v1: archive, countdown, how-to-play, app-link flag, cross-tab merge, storage safety, local-date handling. Record key `daily:v1` (migrated into Hard).
- **v2 (27 Oct): Easy and Hard, score out of 100.** Added Easy 7x7, the score formula, hint -15 (floor 15), best try counts, Retry or Submit, no fence limit, par hidden in play, per-mode records, streaks and stats, key `daily:v2`. Review fixes the same day: the hint is never a free answer check, scores stored as `base`, generic `No room for a hint` message. Best of 3 became best of 5 in v3.1.
- **v3 (28 Oct): optimal solution and everyone's scores.** Added the `See the optimal solution` button and the Cloudflare Worker + D1 stats (re-check, spread, `You beat X%`). Changed later: the date window (was UTC date plus or minus one, now v3.5), the deploy (was filtered to changes in `worker/`, `src/game/`, `assets/levels/`, now always), the solution (was drawn from a stored answer, now solved in the browser, v3.4).
- **v3.1 (3 Nov): 5 tries.** `MAX_TRIES` 3 to 5. A day lost on 3 tries stays finished and sendable for dates up to 3 Nov. Unfinished days keep spent tries and gain the rest.
- **v3.2 (3 Nov): score card and custom domain.** The 1080x1080 card, file sharing, `Save image`, `og:image`, `gnomesweetgnome.app` meta and Worker CORS.
- **v3.3: "Can you beat it?" banner.** Specced on `feat/beat-friend`, never built, not on `main` (see Planned).
- **v3.4 (5 Nov): answers off the page.** A review found every day's answer (180 days, future ones too) in the level files and the old in-page daily showing any date. Removed `answer` from the daily files, remade days from 8 Nov (first planned as 12 Nov), added `solve(level, { exactPar })`, moved hint and solution to a browser worker, retired `play/?daily`.
- **v3.5 (5 Nov): time, stats and deploy hardening.** Review fixes F3 (`startedOn` midnight rule), F5 (new date window), F11 (legacy no-win shape cutover), F4 (Turnstile, off), F6 (Worker always deploys), F7 (`?v=` stamping and the reload guard). No game rules, scoring or levels changed.
