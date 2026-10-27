# Standalone daily spec

The daily as its own page, so it can ship alone with a link to the full game later. Decided by Eric, 27 Oct 2026. Rules of play are unchanged (`docs/GAME_SPEC.md`, rules v4); this spec covers only what is new around them.

## Where it lives

- Page: `daily/index.html`, served at `/invisible-maze/daily/`. This is the link that gets shared.
- `?date=YYYY-MM-DD` loads another day (testing and dev). Without it, the player's local date.
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
- Per date: `{ tries, won, stars, walls, hint, done }` (walls as line keys).
- Plus `seenHowTo: true` once the how-to-play card has been closed.

## Streak and stats

- **Current streak:** consecutive dates won, ending today, or yesterday if today isn't done yet. A lost day or a missed day ends it.
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

## Not in this pass

Preview image, archive of past dailies, server-side stats or leaderboards, retiring `/play/?daily`.
