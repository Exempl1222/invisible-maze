# Art spec: Gnome Sweet Gnome

Source of truth for the game's art. Pairs with `docs/GAME_SPEC.md` (rules). If the two disagree, the rules win and this file gets fixed.

## What's in the pack

```
assets/sprites/            29 SVGs + manifest.json (generated, don't hand-edit)
assets/js/sprites.js       loader: preload, inline copies, gnome state swap, one-shot helper
assets/css/sprites.css     tile backgrounds, wall placement, gnome placement, teleport and goal animations
tools/build-sprites.mjs    builds every sprite from one file. `node tools/build-sprites.mjs`
tools/sprites.html         dev gallery of every sprite, loaded the way the game loads them
docs/ART_SPEC.md           this file
```

## Sprite list

| Group | Files | Canvas | Notes |
|---|---|---|---|
| Gnome | `gnome-{up,right,down,left}-{idle,walk,shrug}.svg` (12) | 140 x 140 | Feet anchor at (70, 131). Loops: idle 4.8s, walk 0.6s, shrug 2.2s. Left is right mirrored, baked into the file |
| Walls | `wall-h.svg`, `wall-v.svg`, `wall-h-hint.svg`, `wall-v-hint.svg` | 64 x 32 and 24 x 72 | Build plays once on load (0.8 to 1.15s). Hint walls add a gold ribbon and sparkle |
| Teleporters | `stump-a.svg`, `stump-b.svg`, `stump-c.svg` | 64 x 64 | Teal, violet, gold. Hollow centre at (32, 26). Glow loops forever |
| Tiles | `tile-grass-{1,2,3}`, `tile-rock`, `tile-bush`, `tile-river`, `tile-bridge-h`, `tile-bridge-v`, `tile-house`, `tile-start` | 64 x 64 | Full bleed. River is seamless in every direction |

`manifest.json` lists every file with its size, anchor and timing, so code never hard-codes a path it can't check.

## Best-practice rules baked in

1. **One source, generated files.** All art comes from `tools/build-sprites.mjs`. Change a colour there and rebuild; never edit an SVG by hand.
2. **Self-contained files.** Each SVG carries its own CSS. Selectors are scoped to the root class (`.gsg-gnome`, `.gsg-wall`, `.gsg-stump`), keyframes are prefixed `gsg-`, and ids are unique per file. Inlining 40 sprites on one page can't clash.
3. **Inline what animates per instance, image what doesn't.** Browsers share one animation clock per image URL, so a second wall drawn as an `<img>` would appear already built. The gnome and walls are inlined from `sprites.js` (each copy gets its own clock). Tiles and stumps are CSS backgrounds (cached, cheap).
4. **Anchored, not centred.** The gnome's feet sit at a fixed point, so swapping direction or state never makes him jump.
5. **Reduced motion respected** in every file and in `sprites.css`.
6. **Colour is never the only cue.** Stump pairs keep their number badge.
7. **Small.** The whole folder is about 260 KB uncompressed; every SVG gzips well.

## Palette and meaning

Replaces rule 6 in `CLAUDE.md` once the gnome lands.

| Colour | Hex | Means |
|---|---|---|
| Hat red | `#c94a32` | The gnome, and the toadstool house he's heading for |
| Timber | `#c48a52` | A wall the player placed |
| Gold | `#e9b949` | A hint wall (ribbon) |
| Teal / violet / amber glow | `#5ff0d8` / `#c79bff` / `#ffcf5a` | Teleporter pairs 1, 2, 3. Glow only ever means magic |
| Water | `#5aa9d6` | River |
| Log brown | `#a0703f` | Bridge |
| Stone grey, bush green | `#9aa3a6`, `#3f7a34` | Pre-built, permanent |
| Outline | `#3b2618` | Every shape. Never black |

## Geometry (computed, not eyeballed)

- Gnome box: 130% of a tile, square, `left: -15%`, `bottom: 9.6%`. Puts his feet 82% down the tile so the hat can overlap the tile above, which reads as depth.
- Teleport: rim of the hollow is `translateY(-31.8%)` of the sprite, hop peak `-43.8%`, fully sunk `59.3%`. The robot box clips at `59.4%` from its bottom (the hollow's centre line) once he's on the rim.
- Horizontal wall art is 2:1 with its ground line 28/32 down, so it's shifted `12.5%` to sit on the line. Vertical art is 1:3, centred on the line.

---

## Builder parcel: wire the sprites into the game

**Who:** Builder (Sonnet). **Spec sections it needs:** this file, plus `GAME_SPEC.md` "Tiles" and "Teleporters". **No rule changes.** Nothing in `src/game/` changes.

### 1. Add the files

Copy `assets/sprites/`, `assets/js/sprites.js`, `assets/css/sprites.css`, `tools/build-sprites.mjs`, `tools/sprites.html` and this file into the repo. Link `sprites.css` after `play.css` in `play/index.html`.

### 2. Preload before the board draws (`main.js`)

`await preloadSprites()` once at startup, before the first `createBoard`. If it rejects, show the existing error state rather than a blank board.

### 3. Tiles (`board.js`, cell creation loop)

- Grass: `b.dataset.v = String(((x * 7 + y * 13) % 3) + 1)`. Deterministic, so the same level always looks the same.
- Rock: `b.dataset.v = (x + y) % 3 === 0 ? '2' : '1'` (every third rock is a berry bush; same rule, different look).
- Teleporter: always set `b.dataset.pairN = String(letters.indexOf(ch) + 1)`. Keep the number text only when there are 2+ pairs, as today.
- Bridge: add `across-v` when the tiles left and right of it are river (the gnome crosses top to bottom).
- River: add `bank-u`, `bank-r`, `bank-d`, `bank-l` for each side whose neighbour is not river or bridge (board edge counts as no bank).

### 4. The gnome (`board.js`)

- Replace `robot.innerHTML = ROBOT_SVG` with `setGnome(robot, 'down', 'idle')`. Keep `id="robot"`, the `.robot` class and `moveRobot()` exactly as they are; tests depend on them.
- In `play()`, before each step work out the direction from the previous tile to the next with the existing `STEP` table and call `setGnome(robot, DIR_OF_STEP[d], 'walk')`. `setGnome` is a no-op when nothing changed, so call it every step.
- After the last step: on a win (`too-far`) call `setGnome(robot, lastDir, 'shrug')` instead of the `jolt` class. On a loss (`reached`) run `playOnce(robot, 'home', 600)`.
- `resetRun()` puts him back to `down` + `idle`.

### 5. Teleport (`board.js`, the `if (via)` branch)

Replace the vanish with:

```js
moveRobot(via, { ms: stepMs * 0.45 });
await sleep(stepMs * 0.45);
await playOnce(robot, 'dive', 560, { keep: true }); // hop on, sink in; stays hidden
pulse(via, 'flash'); pulse(sim.steps[i], 'flash');
const link = drawLink(via, sim.steps[i], 'jump');
moveRobot(sim.steps[i], { instant: true });
robot.classList.remove('dive');
await playOnce(robot, 'pop', 520);                 // pop out of the twin, hop down
removeLink(link);
```

Check `cancelled()` after each await, as the current code does.

### 6. Walls (`board.js`, `setWall`)

When adding a bar: set `bar.dataset.dir = line[2] === 'D' ? 'h' : 'v'` (a `D` line is horizontal), then append `sprite(name, 'wall-art')` where `name` is `wall-h`, `wall-v`, or the `-hint` version for hint walls. Keep every existing class and `data-line`; the sprite only adds art. Each placement builds itself because each copy is inline.

### 7. Clean up

- Remove `ROBOT_SVG` from `icons.js` once nothing imports it, and the `.robot > svg` hide rule from `sprites.css`.
- Update `CLAUDE.md` rule 6 with the palette table above.
- The home-page teaser (`teaser.js`) still draws the robot. Out of scope; log it as the next parcel.

### Definition of done

- `npm test` green, with no test assertions loosened.
- New Playwright checks: the board has a `.gnome-sprite` inside `#robot`; placing a wall adds a `.wall-art` inside that `.wall-bar`; after a teleport step `#robot` has no `dive` or `pop` class left on.
- maze-playtest screenshots at 390px for: a level with a river and bridge, a level with 2 teleporter pairs, a win (gnome shrugging), a loss (gnome entering the house), a board with 4+ walls including one hint wall.
- `tools/sprites.html` shows all 29 sprites with no console errors.
- Independent Opus review before merge, as usual.
