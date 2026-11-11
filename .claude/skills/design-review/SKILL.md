---
name: design-review
description: Independent, read-only review of how Gnome Sweet Gnome looks and whether it follows the design rules (colour legend, contrast, tap targets, art over the board, type, copy, consistency). Use when asked to review the site's appearance, design or design-skill compliance, before merging a visual change, or after new art or a new page.
---

# Design review

A fresh-eyes audit of the site as a player sees it, checked against this repo's design rules. It finds and ranks problems with evidence. It does not fix them: a Builder fixes, then this review (or maze-playtest) runs again. That keeps the reviewer honest.

**How it differs from maze-playtest:** maze-playtest is the QA gate (does it load, fit and play). This skill is the design audit (does it follow the colour legend, read well, feel consistent, and avoid generic templated choices). Run maze-playtest's automated gate first, and don't repeat its checks here except where noted.

## What it checks against

Read these first, in this order. They win over taste:

1. `CLAUDE.md` rules 4 (mobile first, 44px targets, no horizontal scroll) and 6 (colour means something: the legend).
2. `docs/ART_SPEC.md`, `docs/MENU_SPEC.md`, `docs/VILLAIN_SPEC.md` (what each screen and sprite is meant to look like).
3. `docs/DAILY_SPEC.md` and `docs/ROADMAP.md` (to catch copy that's out of date).
4. The `frontend-design` skill, loaded with the Skill tool, used only as a lens for generic tells (see step 6). Where a spec has already made a choice, the spec wins.

## Fixed lenses

Every review covers all seven. Say "pass" with a line of evidence when a lens is clean.

| Lens | Question |
|---|---|
| 1. Board legibility | Can the player see every tile, fence, gnome and house at all times? Nothing but Croakwell's hands may paint over a tile. |
| 2. Colour legend | Is each legend colour used only for what it means (rule 6)? No decoration in hat red, lime, gold or the teleporter colours. |
| 3. Contrast | Text 4.5:1, large text and UI parts 3:1, checked in code (`contrast.py`), never by eye. |
| 4. Touch and fit | 44px targets, no horizontal scroll, key action (Try) visible, dialogs open at their title, at all three sizes. |
| 5. Consistency | The same control looks the same everywhere (tabs, signs, buttons, dialogs); one icon style; one voice. |
| 6. Type and generic tells | Grandstander for display, Nunito for body, clear scale; none of the `frontend-design` tells (identical card grids, ALL-CAPS eyebrow labels, `A · B · C` meta strings, `→` on buttons, single-word accents). |
| 7. Copy | Plain, current and true: matches today's rules and status, uses gnome and house (never robot or beacon), no em dashes, sentence case. |

## Steps

1. **Pin what you're reviewing.** `git log -1 --format='%h %s'`. Review `main` unless told a branch or PR. Say the commit in the report.
2. **Serve and run the gate.** `npm run serve` in the background, then `npm run test:e2e`. If it fails, report that first; a broken build isn't a design review.
3. **Take the screenshots.** `node .claude/skills/design-review/shots.mjs <out-dir> [YYYY-MM-DD]` (the date defaults to today in Sydney). It covers home, play level select, a level, the daily Easy and Hard boards, How to play, an Easy win and an Easy loss. It does this at 390x844 (phone, touch, 2x), 1366x625 and 1280x585, and prints one JSON line per page: horizontal scroll (`hScroll`), controls under 44px (`small`, board tiles excluded), whether the whole board and Try fit (`boardFits`, `tryFits`), how far an open dialog is scrolled (`dialogTop`, should be 0), then console errors and failed requests. To review another checkout, serve it on another port and set `BASE=http://localhost:<port>`. Then **open and look at every screenshot**. Numbers miss things like a hat over the house.
4. **Run the art-over-board check.** `npx playwright test tests/design.spec.js`. It hit-tests every tile against Croakwell's hat. If new art sits near the board (a new pose, prop or effect), extend that test to cover it, and prove the new check fails first (see "Every check must fail on the old code").
5. **Run the colour checks.** `python3 .claude/skills/design-review/contrast.py` prints every standard text and UI pair from the `:root` tokens, with pass or fail. `python3 .claude/skills/design-review/contrast.py --uses` lists every CSS line that uses a legend colour, so you can judge each one against rule 6. Add pairs for anything new with `--pair FG BG MIN`.
6. **Read for generic tells and copy.** Skim `index.html`, `play/index.html`, `daily/index.html` and the dialog copy in `assets/js/daily/`. Grep for em dashes and ALL-CAPS labels. Compare any status or rule claim on the page with `docs/ROADMAP.md` and `docs/DAILY_SPEC.md`.
7. **Write the report** (format below). Crop screenshot evidence for each finding above Low and send it with the report.

## Accepted, don't re-file

- **Try below the fold on phones.** Eric chose the full-width toad under the board and accepted a short scroll to reach Try (`tryFits: false` at 390x844 is expected). It must still fit at 1366x625 and 1280x585.
- **Croakwell's hands over the board edge, and the hat during a 600ms cast.** By design (`docs/VILLAIN_SPEC.md`).
- **Gold stars and grid borders under 3:1.** Both carry a 2px outline; `contrast.py` marks them "low, has outline".
- **Fallback fonts in sandbox screenshots.** Google Fonts are blocked there.

## Severity (design reading of REVIEW_CONTEXT.md's anchors)

- **High:** breaks on a common phone (the board can't be seen or played, a dialog can't be closed, horizontal scroll at 390px).
- **Medium:** hides game information (art over a tile, fence, gnome or house), a legend colour used so it misleads, text under 4.5:1, a rule 4 breach on the main flow (Try hidden, target under 44px).
- **Low:** visual polish, toad layout tweaks, copy, consistency, generic tells.

## Every check must fail on the old code

A check only counts once you've seen it fail on the code it is meant to catch. Before adding or trusting a test, measurement or script:

1. Run it on the broken version (`git stash`, check out the old commit, or put the old values back), and confirm it **fails** for the right reason.
2. Restore the fix and confirm it **passes**.
3. Say both results in the report or PR.

This skill's own scripts were proven the same way: on `main` at `27b906c` (before PR #27) `shots.mjs` flagged Daily 42px and Play 35px, How to play opening 126px down at 1280x585, and Try below the fold at 1280x585; `contrast.py --pair gold panel 4.5` fails with exit 1.

Why: the first version of the hat check passed on the old art. Croakwell is `pointer-events: none`, and `elementsFromPoint` skips such elements, so the check could never see him. Only running it against the old angles exposed that. Watch for the same trap with anything that measures through hit testing, `getBoundingClientRect` on rotated SVG (it's a loose box), or a class the old code doesn't have yet. A selector that matches nothing makes a check pass without testing anything.

## Report

Lead with the answer, then:

- **BLUF:** one or two lines with the worst finding and an overall verdict.
- **What to fix:** findings ranked by severity. Each one gets the lens, the evidence (screenshot, measurement or file:line), and one or two fix options with their trade-off.
- **What's passing:** one line per clean lens, with its evidence.
- **Counterpoint:** where a fix pulls against an earlier design decision (for example, toad framing against board legibility), and which way you'd lean.
- **Not checked:** anything the sandbox blocked (Google Fonts, the live site) so the owner checks it on a phone.

## Environment notes

- Google Fonts often won't load in a sandbox. Screenshots then show fallback fonts, so don't file type findings from them.
- If `npm install` is blocked, a preinstalled Playwright can stand in for `@playwright/test`: symlink it into `node_modules` with a two-line shim that re-exports `playwright/test`. Never commit `node_modules`.
- `tests/answers.js` `withAnswer(level)` gives a level's par fences, so `shots.mjs` can reach a win without guessing.
