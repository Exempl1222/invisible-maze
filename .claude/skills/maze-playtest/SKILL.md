---
name: maze-playtest
description: Playtest the Invisible Maze site or game in a real browser on phone and desktop viewports. Use after any UI or game change, before opening a PR, or when asked to check, playtest, QA or screenshot the site.
---

# Maze playtest

Check the build the way a player meets it: on a phone first. The goal is evidence (screenshots, errors, numbers), not an opinion that it "looks fine".

## Steps

1. **Serve the site.** `npm run serve` (port 4173), in the background.
2. **Run the automated gate.** `npm run test:e2e`. If it fails, stop and report the failing test and its error. Don't patch tests to make them pass.
3. **Look at it.** With Playwright, open each page at 390x844 (phone, touch on), 1366x625 and 1280x585 (Windows laptop browser windows; the short height is the point). Screenshot the level select, the daily screen (`?daily&date=2026-10-27`), a 7x7 level mid-placement with a line highlighted (hold the press), a 9x9 level, a win panel and a lose panel, and actually view them. Check for:
   - **the whole board visible without scrolling** on load: every tile fully inside the window at all three sizes (check bottom row and right column; the page must not need a scroll to see the last row)
   - horizontal scroll or clipped text
   - tap targets under 44px
   - text that is hard to read against the background
   - anything overlapping the board
4. **Play it (from Phase 4).** For each seed in the list the spec gives (or seeds 1 to 20), play one level to the end using taps only. Record per seed: result (win, lose, stuck), moves taken, any console error, and whether the level felt trivially easy or impossible.
5. **Check reduced motion.** Reload with `reduced_motion="reduce"` and confirm nothing animates and the board still makes sense.

## Report

Lead with a pass or fail line, then a short table:

| Area | Result | Evidence |
|---|---|---|
| Automated tests | pass/fail | failing test name |
| Phone layout | pass/fail | screenshot path, issue |
| Desktop layout | pass/fail | screenshot path, issue |
| Levels played | n won / n lost / n stuck | seeds that broke |
| Console errors | count | first message |

List each bug with steps to reproduce (seed, taps). Don't fix them in the same pass; a separate builder fixes, then this skill runs again.

## Notes

- Google Fonts may fail to load in sandboxes; that's not a bug. A 404 on any of our own files is.
- The site lives under `/invisible-maze/` on GitHub Pages, so also check links on the live URL after a deploy.
