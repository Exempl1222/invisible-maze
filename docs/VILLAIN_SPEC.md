# Villain spec: Sir Croakwell

Sir Croakwell is a cheeky toad wizard who casts the magic that grows the player's fences. He frames the gameplay from the bottom of the board, seen from behind, and reacts to play. On the home page and in How to play he faces the player.

Approved mockups (design-canvas source, reference only, not shipped): `docs/mockups/croakwell/`.

- `ToadVillain.dc.html`: the back view rig. `renderVals()` holds the exact pose numbers for `idle`, `cast`, `gloat` and `sulk`.
- `ToadFront.dc.html`: the face-on rig, poses `smug` (wink, hands over a whoopee cushion) and `point` (talking, one finger up).
- `TitleScreen.dc.html`, `HowToPlay.dc.html`, `ToadIdle.dc.html`: where he sits on screen.

No rule changes. Nothing in `src/game/` changes.

## Character (keep all of these)

- Round olive toad, soft radial shading, a few pale freckles (no lumpy warts), big golden eyes.
- Face-on: big round pupils with two white catchlights, pink cheeks, small grin with one buck tooth and a tongue tip. `smug` winks his right eye (viewer's left).
- Purple wizard hat, slightly crooked, with a coiled spring tip and an orange striped pom-pom, an orange band with gold dots, a lilac stitched patch, a gold star, a joker card tucked in the band, and a tiny snail on the brim.
- Purple cloak with orange harlequin diamonds on the hem.
- Back view only: a slingshot in his back pocket and a pink whoopee cushion tucked in his cloak (the player can see his prank gear, the gnome can't).
- Webbed four-finger hands with round pale fingertip pads.

## Palette rules (CLAUDE.md rule 6 still applies)

- **No hat red `#c94a32` anywhere on him.** The mockup's toadstool clasp becomes a gold acorn button.
- **No teleporter glows** (teal, violet `#c79bff`, amber). His magic is lime: glow `#d8f26a`, spark core `#f4ffc4`. Add it to the palette table in `ART_SPEC.md` as "Croakwell's fence magic".
- Confetti uses orange `#ff9a3c`, pink `#ff7fa6`, lime `#d8f26a` and cream `#fff6e0` only.
- Outline `#3b2618` on every shape, never green or black outlines. Use the existing `part()` helper.

## Sprites (generated in `tools/build-sprites.mjs`)

| File | Canvas | Notes |
|---|---|---|
| `toad-back-idle.svg` | 390 x 140 | Hands gripping the board's bottom corners (about 9% in from each edge), arms angled out from the shoulders. Loops: slow breathe (body scale 1 to 1.015, 3.2s), fly orbiting the hat tip (2.4s) |
| `toad-back-cast.svg` | 390 x 140 | Hands raised so fingertips reach about 40px above the canvas (`overflow: visible`). Throat sacs puffed, hat tip perked, fingertips glow lime, confetti twinkles |
| `toad-back-gloat.svg` | 390 x 140 | One fist pumped up, other hand on the edge, body bounced up, "Hehehe!" in Grandstander, tongue snapping the fly, confetti. Loop: 0.5s bounce |
| `toad-back-sulk.svg` | 390 x 140 | Body sunk, heavy lids, hat tip flopped, hands dropped out of view, rain cloud with drizzle, "Rats." and a flat whoopee cushion with "pfffft..." |
| `toad-front-smug.svg` | 390 x 460 | Title pose. Fly orbits the hat. Optional idle: blink of the open eye every 4s |
| `toad-front-point.svg` | 390 x 460 | How to play pose. Finger spark twinkles |

The back view is re-proportioned from the mockup into a wide, short 390 x 140 band: head dome top about 52px down, hands near the left and right edges, body trimmed to the dome, eye bulges, hat and the top of the cloak (slingshot, acorn, whoopee cushion). Shapes, colours and props match the mockup; the arms are long and splay out to the corners.

Same file rules as every sprite: self-contained CSS scoped to `.gsg-toad`, `gsg-` keyframes, unique ids, reduced motion respected, add to `manifest.json` and `tools/sprites.html`.

## Code

New module `assets/js/villain.js`:

- `mountVillain(host)`: preloads the four back sprites, inlines `toad-back-idle` into `host`, returns `{ setMood(mood), cast() }`.
- `setMood('idle' | 'gloat' | 'sulk')` swaps the inline sprite (same pattern as `setGnome`, no-op if unchanged).
- `cast()` shows `toad-back-cast` for 600ms, then returns to whatever the mood was. A second call during a cast restarts the timer.
- Reduced motion: still swaps poses, no bounce or confetti motion.

On the wall itself: when the player places a fence, the `.wall-bar` gets a one-shot `.magic` class (lime glow and 4 confetti bits, 600ms) on top of the existing build animation. Not on removal, not on hint walls being restored on reload.

## Where he appears

### 1. Gameplay border (daily page and play page)

- An element `<div class="villain" id="villain" aria-hidden="true"></div>` directly after the board in the game column, before the status and controls.
- His box is always exactly as wide as the board (`var(--board-size)`, centred), on phones and desktop. His height `--villain-h` is set by `fit()` in `assets/js/play/board.js` to board width x 140/390, with no separate cap. Negative top margin (the grid gap, 10px on a phone or 12px on desktop, plus 18% of his height) so his hands, which grip the board's bottom corners, overlap its bottom edge. `pointer-events: none` so every board line stays tappable, and the gnome (`.robot`) draws above his hands.
- Phones (narrow layout): the board is sized exactly as before him; a short scroll to reach Try is accepted.
- Desktop (wide layout): `fit()` reserves his visible height (height less the overlap) from the window height by shrinking the board a little, so he is fully visible (at 1366x768 too).
- Triggers:

| Event | Mood |
|---|---|
| Page load, Reset, Retry, new day, archive day | `idle` |
| Player places a fence (tap or keyboard, including the hint fence) | `cast()` |
| Gnome trapped (win) | `gloat` |
| Gnome reaches home (loss, including the third loss) | `sulk` |
| Showing a finished day on reload | `gloat` if the best score is above 0, else `sulk` |

### 2. Home page title (`index.html` hero)

- Face-on `toad-front-smug` in the hero, with the speech bubble "He'll never make it home." Keep the teaser board below it on phones (beside it on desktop).
- The hero actions become: **Easy** (7x7 garden) linking to `daily/?mode=easy`, **Hard** (9x9 garden) linking to `daily/?mode=hard`, then the existing "See how it plays" and "Play" links as quieter buttons.
- Add a "Daily" link to the site nav on the home and play pages, pointing at `daily/` (`../daily/` from play).

### 3. How to play dialog (daily page)

- Top of the dialog: `toad-front-point` at about 60% size on the left, speech bubble "Ahem. Listen up, apprentice." on the right.
- Keep the four existing steps and their wording (they match the current rules).
- The close button text becomes "Let's trap him".

### 4. Play page Daily tab

- The Daily tab in `assets/js/play/select.js` links to `../daily/` instead of `./?daily`, so Easy and Hard are reachable from Play. Leave the old in-page daily code in place (deep links still work); log its removal as a follow-up.

## Definition of done

- `npm test` green, no loosened assertions.
- New Playwright checks: `#villain` exists on the daily page with a `toad-back-idle` sprite; placing a fence switches it to `toad-back-cast` and back to idle; a win shows `toad-back-gloat`; a loss shows `toad-back-sulk`; the home page has Easy and Hard links to `daily/?mode=easy|hard`; the play page Daily tab points at `../daily/`; the How to play dialog contains `toad-front-point`.
- Every board line under his hands is still tappable (test a tap on a bottom-row line).
- maze-playtest screenshots at 390px and desktop: home hero, How to play, daily idle, cast, win, loss.
- No horizontal scroll at 390px. `tools/sprites.html` shows the 6 new sprites with no console errors.
- `ART_SPEC.md` sprite list and palette updated, `CLAUDE.md` layout updated, ROADMAP row 6h added.
- Independent Opus review before merge.
