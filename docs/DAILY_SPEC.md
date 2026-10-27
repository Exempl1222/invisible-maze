# Standalone daily spec

The daily as its own page, so it can ship alone with a link to the full game later. Decided by Eric, 27 Oct 2026. Rules of play are unchanged (`docs/GAME_SPEC.md`, rules v4); this spec covers only what is new around them.

## v2: Easy and Hard, scored out of 100 (Eric, 27 Oct)

**This section supersedes the rest of the spec wherever they disagree** (tries as lives, wall budget, stars, par shown, answer reveal, one shared streak). Everything not mentioned here (archive, countdown, how-to-play, app link, cross-tab merge, storage safety, date handling) stays as written below.

### Two dailies
- **Easy:** 7x7, par 3 Monday to Saturday, par 4 Sunday. New batch `assets/levels/daily-easy.json`, built by `tools/build-daily.js --size 7` with the same start date (2026-10-27) and 180 days, verified like every level (rules v4, unique boards).
- **Hard:** the existing 9x9 `daily.json`, unchanged.
- Both share the day number (`#N`). Tabs `Easy | Hard` under the title; `?mode=easy|hard`. With no mode in the URL, the page opens the mode the player last chose, Easy on a first visit.
- Each mode has its own record per date, its own hint, its own streak and its own stats.

### Play
- **No fence limit.** The player can place as many fences as they like. Still refused: cutting every route, more than 2 sides of the gnome or of his house (rules v4), unbuildable lines. In code the page gives the engine a budget equal to the number of buildable lines; the engine and the level files don't change.
- Shown: `Fences` (count only), `Move limit`, `Moves left`, `Best` (best score so far today, `-` before a win). **Par is never shown**, and nothing reveals the answer, including on a lost day.
- Buttons: **Try** (sends the gnome), **Reset** (removes the player's fences; a hint fence stays), **Hint**.
- **3 tries a day.** Every Try spends one, win or lose.
  - Win: the try's score shows. Buttons `Retry for a better score (N left)` (keeps the fences) and `Submit`. Submit ends the day.
  - Loss: `He made it home`; with tries left, `Try again (N left)`, fences stay.
  - After try 3 the day ends on its own.
- **Day score = the best winning try** (best of 3). A day with no win scores 0.
- **Score:** `max(30, round(100 - 70 * (fences - par) / (2 * par)))`. Par scores 100, 3x par or more scores 30. Fences can't be fewer than par.
- **Hint:** 1 per mode per date. It places one fence from the stored answer (as now) and takes 15 points off every winning try that day after the floor, so the lowest hinted win is 15. The button reads `Hint (-15)`, then `Hint used`.

### Results, share, streaks
- Result panel: the day score large (`82 / 100`), then one line per try (`Try 1  65`, `Try 2  82`, `Try 3  He made it home`), Share, Stats, countdown.
- Share (pure function, unit tested):
  ```
  Gnome Sweet Gnome #1 Hard 🍄
  82/100 💡
  🟥🟩🟩
  https://exempl1222.github.io/invisible-maze/daily/?mode=hard
  ```
  One square per try used: 🟥 loss, 🟩 win. ` 💡` only if the hint was used. Lost day: `0/100 🏠`. Archive days keep `(archive)` after the number.
- **Streak per mode:** consecutive days with a score above 0, finished on their own date (as before).
- **Stats per mode** (the dialog has the same Easy | Hard tabs): played, win %, average score, best score, current and best streak, and bars for 100, 80 to 99, 60 to 79, 30 to 59, 1 to 29, and 0.
- **Archive dialog:** each row shows both scores (`Easy 88 · Hard -`).

### Saved data
- New key `gnome-sweet-gnome:daily:v2`, `{ easy: { date: record }, hard: { date: record }, lastMode, seenHowTo }`. A record holds `tries` (array of `{ fences, won, score }`), `hint`, `walls` (current fences), `done`, `finishedOn`. The cross-tab merge keeps the longer `tries` list.
- On first load, v1 records become Hard records: one try, scored from their walls, the level's par and the hint, `done` and `finishedOn` kept. v1 is then left in place, unused.

## Where it lives

- Page: `daily/index.html`, served at `/invisible-maze/daily/`. This is the link that gets shared.
- Without a query, the page plays the player's local date (**today**).
- `?date=YYYY-MM-DD` is the **archive** (Eric, 27 Oct): any of the 29 days before today (today minus 1 to today minus 29) plays for real and is saved. Today's date in `?date` is the same as no query. A future date shows `Not ready yet. This gnome is still packing.` with a button to today. A date older than 29 days, or not a real date, shows `That day is out of the archive.` with a button to today. Dates outside the batch still show the break message.
- Code: `assets/js/daily/` (new). Reuses the engine (`src/game/`), `assets/js/play/board.js`, `lines.js`, `icons.js`, `daily.js` (date maths) and `assets/js/sprites.js`. It must not import `assets/js/play/main.js` or `storage.js`.
- The deploy workflow copies `daily/` into the site.
- `/play/?daily` (the in-app Daily tab) is left as it is for now.

## The day

- **Daily number:** `#N`, where N is the day's index in `daily.json` plus 1 (27 Oct 2026 is #1).
- **3 tries a day.** A try is spent when the player presses Go.
  - Win on any try: the day is done, won on try N.
  - Lose with tries left: walls stay, the button reads `Try again (2 left)` / `(1 left)`.
  - Lose on try 3: the day is done, lost. The board shows one par answer in the hint (gold ribbon) style with the note `One way to fence him in (par N).`
- **Stars** are scored exactly as now (`stars(par, walls, budget, hints)`). Tries do not change stars; they show in the result and the share.
- **1 free hint a day**, its own inventory, separate from the full game's. It works like a normal hint (one par-answer wall, costs 1 star, minimum 1). The button reads `Hint (1)`, then `Hint used` and is disabled. No ad panel.
- **Done is done.** Once the day is won or lost, the board is locked and shows the final walls. A reload shows the same finished state, not a fresh board.
- **Reload mid-day** restores tries used, the hint (and its wall) and the walls on the board. Reloading must never give back a try.
- Outside the batch: the existing break message (`The daily is taking a break.`), with no link to the levels unless the app link is on.

## Saved on the device

- One localStorage key, `gnome-sweet-gnome:daily:v1`, separate from the full game. Same pattern as `storage.js`: every access wrapped, memory is the fallback, corrupt data is ignored.
- Per date: `{ tries, won, stars, walls, hint, done, finishedOn }` (walls as line keys).
- **Never lose a spent try across tabs:** before every write, re-read storage and merge per date (highest `tries`, `done` and `won` stay true once set, keep an existing `hint` and `finishedOn`). Listen for the `storage` event and re-render if the day on screen changed.
- Plus `seenHowTo: true` once the how-to-play card has been closed.

## Archive

- A calendar button in the header opens an **Archive** dialog: the last 30 days, newest first (today at the top, marked `Today`), each row showing `#N`, the date and its result (stars, `Lost`, `In progress` or `Not played`). Days before the batch start are left out. Tapping a row goes to that day.
- An archive day plays exactly like today (3 tries, 1 hint, locked when done) and is saved under its own date.
- The title line says `Daily #N` plus an `Archive` tag on past days, with a `Today's gnome` link back.
- **Archive plays don't count toward the streak** (only a day finished on its own date does). They do count in played, win % and the star bars. Each record stores `finishedOn` (local date the day was finished) to tell them apart.
- Share text for an archive day is the same, with `(archive)` after the number.

## Streak and stats

- **Current streak:** consecutive dates won on the day itself (`finishedOn` equals the date), ending today, or yesterday if today isn't done yet. A lost day or a missed day ends it; catching up in the archive does not repair it.
- **Best streak:** longest run ever.
- **Stats card:** played, win %, current streak, best streak, and a bar chart of results: 3 stars, 2 stars, 1 star, lost. Today's result is highlighted.
- Streak logic is pure and unit tested (dates in, numbers out).

## Share

Plain text, built by a pure function (unit tested). Won:

```
Gnome Sweet Gnome #1 🍄
⭐⭐⭐ 4 fences (par 4)
🟥🟩 2/3
https://exempl1222.github.io/invisible-maze/daily/
```

- One square per try used: 🟥 a loss, 🟩 the win. Lost day: `🟥🟥🟥 X/3` and the star line becomes `🏠 He made it home`.
- Hint used: append ` 💡` to the star line.
- The link is the page URL with no query string.
- Share button: `navigator.share` when available, otherwise copy to clipboard and say `Copied`. If both fail, show the text in a selectable box.

## Countdown

- After the day is done: `Next gnome in 5h 12m`, counting to local midnight, updated each minute.
- At midnight it says `A new gnome is here` with a `Play` button that reloads.
- The countdown maths is a pure function (unit tested).

## How to play

- A dialog that opens on the first visit and from a `?` button in the header.
- Three short steps, each with a small sprite:
  1. The gnome walks the shortest way home.
  2. Tap the lines between tiles to build fences. You can't cut off every way through.
  3. Make his walk longer than his move limit. Fewer fences, more stars. 3 tries a day.
- Button: `Let's go`. Closing it sets `seenHowTo`.

## Page

- Mobile first, 390px wide, same art, fonts and colour tokens as the game. Touch targets at least 44px. Dialogs are `<dialog>` with focus kept inside and Escape to close.
- Header: wordmark (not a link while the app link is off), `?` (how to play) and a stats button.
- Title line: `Daily #1` with the date `Tue 27 Oct` under it. Stats row (walls, par, move limit, moves left) and controls as in the game, plus a tries indicator (three pips).
- Result panel when done: heading, stars, `Won on try 2 of 3` (or lost), walls vs par, Share (primary), Stats, countdown.
- Meta for link previews: `og:title` `Gnome Sweet Gnome: daily puzzle`, `og:description` `Fence in the runaway gnome. One new puzzle a day.`, `og:url`, `twitter:card` `summary`. A preview image comes later.

## App link (built, switched off)

- `assets/js/daily/config.js` exports `APP_LINK = { enabled: false, href: '../play/', label: 'More gnome puzzles' }`.
- When `enabled` is true: the wordmark links to `href`, the result panel shows a card `Want more? Play the full game.` with that link, and the break message links there too.
- When false, nothing on the page links to the full game.

## Review fixes (27 Oct)

- Tries indicator reads `Tries left` with filled pips for tries remaining (won try shown as a done tick, lost tries as empty).
- When the day ends live, focus moves to Share. `#result` loses `role="status"`; `#status` announces one line (`Fenced in on try 1, 3 stars.` / `He made it home. Out of tries.`) and the empty status line takes no space.
- On a lost day the walls stat is labelled `Answer` and shows the answer's wall count.
- Countdown re-ticks on `visibilitychange`; a tab left open past midnight on an unfinished today shows `A new gnome is here` with Play.
- Footer: `A new gnome every day.` (no "in development").
- No hard-coded colours in daily.css; use tokens.

## Not in this pass

Preview image, server-side stats or leaderboards, retiring `/play/?daily`.
