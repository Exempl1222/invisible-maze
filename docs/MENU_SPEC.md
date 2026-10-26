# Menu spec: Gnome Sweet Gnome retheme

Retheme everything around the board (home page, level select, game screen chrome, results, messages) from the dark sci-fi "Invisible Maze" look to the daylight storybook garden. **Rules don't change. Nothing in `src/game/` changes.** The engine keeps its words (robot, beacon); only what the player sees changes.

Visual reference: `docs/art/reference-board.html` (open it in a browser). Match its fonts, palette, outlines and card style.

## M1. Name and identity

- Product name **Gnome Sweet Gnome**, tagline **a fence-building puzzle**. Use both on the home page hero; the name alone in the header wordmark.
- Page titles: `Gnome Sweet Gnome` (home), `Play · Gnome Sweet Gnome` (game). `theme-color` becomes the new page background.
- Wordmark icon and favicon: the gnome's head (hat, face, beard) cropped from the down-facing gnome art. Add it to `tools/build-sprites.mjs` as `icon-gnome.svg` (64 x 64, no animation) so it stays generated, and point `assets/favicon.svg` at the same drawing.
- Footer: `Gnome Sweet Gnome is in development.`

## M2. Daylight garden palette and type

Replace the tokens on `:root` in `site.css`. Keep the token names where the meaning survives so the rest of the CSS keeps working; rename where the meaning changed and update every use.

| Token | Value | Use |
|---|---|---|
| `--page` (was `--night`) | `#e3ecd2` | Page background |
| `--panel` | `#f8fbf1` | Cards, stats, result panel |
| `--grid` | `#c9d7b2` | Borders |
| `--chalk` (text) | `#2f4220` | Primary text |
| `--muted` | `#5d6e4c` | Secondary text |
| `--robot` (primary action) | `#c94a32` | Primary buttons, the gnome, current level. White text on it |
| `--wall` | `#c48a52` | Anything about player walls (line hint, wall counters) |
| `--beacon` | `#c94a32` on cream, used sparingly | The house |
| `--teleporter` | `#3fb8a3` for text and outlines on cream (the bright glow `#5ff0d8` fails contrast as text) | Teleporter badges, link line |
| `--outline` (new) | `#3b2618` | 2px outlines on buttons and cards, like the art |

- Fonts: **Grandstander** 600/800 for display, **Nunito** 400/700 for body (Google Fonts, same `<link>` pattern as now, with fallbacks). Drop Chakra Petch and Atkinson Hyperlegible.
- Every text and background pair must pass WCAG AA (4.5:1 body, 3:1 large text and UI). Check with a quick script, not by eye.
- Buttons: rounded pill, 2px `--outline` border, small offset shadow in `--outline` (2px down) that flattens on press. Touch targets stay at least 44px.
- Board frame: a 3px `--outline` border with 14px radius around the board, like the reference.

## M3. Level select

- Mode tabs (`Levels | Daily | Lab`): styled as small wooden sign boards (timber fill, outline, cream text). **Keep the labels and the `nav[aria-label="Mode"]`**, tests use them.
- Group titles get garden names, with the size kept for clarity: `Seedlings · 7x7` (tutorial), `The Garden · 7x7` (main), `The Wild Wood · 9x9` (hard).
- Level buttons: cream stepping stones (rounded, outline, slight shadow). Number in Grandstander, stars below in gold `#e9b949` with an outline. The next level to play gets the hat-red ring **and** a small idle gnome peeking over the top edge (inline `gnome-down-idle`, roughly a third of the button's height). Keep each button's `aria-label` format exactly (`Level 3, 2 stars`).
- Summary line when nothing is solved: `Fence the gnome in before he gets home. Fewer walls, more stars.` The solved summary keeps its numbers.
- Continue button: `Play level N` stays (tests use it).

## M4. Game screen and messages

- Stats row: cream cards with outline. Labels stay `Walls`, `Par`, `Move limit`, `Moves left`.
- All player-facing copy says **gnome** and **house** instead of robot and beacon. That covers status messages, refusal messages, aria labels on tiles (`Gnome start`, `House`), board help text and the result panel. Where a test asserts the old wording, update that one assertion to the new wording and nothing else. List every changed assertion in the PR description.
- Teleporter tile labels: `Stump 1, row 2 column 3` instead of `Teleporter 1`.
- Hint and "out of hints" panel: same behaviour, cream panel, gold accent for hint.

## M5. Results panel

- Win (`too-far`, the gnome can't get home): heading `Fenced in!`, the gnome shrugging (`gnome-down-shrug`, inline, about 72px) beside the stars. Keep the stars' `role="img"` and `N of 3 stars` label.
- Loss (`reached`): heading `He made it home`, the toadstool house tile image beside the text. Body copy suggests trying a different fence line.
- Keep every button label (`Replay`, `Try again`, `Next level`, `All levels`, whatever exists today) and the `#hint-used` text.

## M6. Home page

- Hero: `<h1>Gnome Sweet Gnome</h1>`, tagline as a subheading, then: `A garden gnome has run away and is heading home by the shortest path. Build wooden fences on the lines between tiles so the walk is too long for him. Use as few fences as you can.` Buttons `See how it plays` and `Play`.
- The teaser replay: redraw it with the sprites (tiles as backgrounds, wooden wall sprites, the gnome walking and turning, shrug at the end). It still uses `teaser-data.js` and must still pass `tools/teaser.test.js`. Reuse `assets/js/sprites.js` and `assets/css/sprites.css`; don't fork the art.
- "How it works" section: same structure, copy in the gnome voice, small inline sprites as illustrations (a wall, a stump pair, the house) instead of the robot icons.

## M7. Clean up

- Remove the robot icon and any CSS that only styled the dark theme.
- Update `README.md` and `CLAUDE.md` (name, layout lines for the new files, rule 6 palette meanings from `docs/ART_SPEC.md`, and add rule: "Art is generated. Change `tools/build-sprites.mjs` and rebuild, never hand-edit `assets/sprites/`.").
- Add `docs/ROADMAP.md` row `7 | Gnome retheme | sprites in game, menus rethemed | Builder (Sonnet), reviewed by Opus | In review`.

## Definition of done

- `npm test` green. No test deleted, skipped or loosened; only the wording assertions listed in the PR changed.
- New Playwright checks: header wordmark text is `Gnome Sweet Gnome`; the next-level button contains a `.gnome-sprite`; a win shows `Fenced in!` with a gnome sprite; a loss shows `He made it home`.
- AA contrast script output pasted into the PR description.
- Screenshots at 390px and 1280px of: home, level select, a game mid-play with walls and a stump pair, win result, loss result. Look at them before calling it done.
