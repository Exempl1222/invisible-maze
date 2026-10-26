# CLAUDE.md

Handbook for any Claude session or agent working in this repo. Read this first, then `docs/ROADMAP.md` for where things stand.

## What this is

Gnome Sweet Gnome (repo `invisible-maze`), a mobile-first fence-building puzzle. The engine keeps its words (robot, beacon); players see gnome and house. Plain HTML, CSS and JavaScript (ES modules). No framework, no build step. Hosted on GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main`.

## Layout

```
index.html            landing page (hero teaser is a canned replay, not game logic)
play/index.html       the game: level select, board, robot replay, results
assets/css/site.css   site styles; colour tokens on :root
assets/css/play.css   game page styles (uses the site tokens)
assets/js/sprites.js   loads the sprites; inline gnome and walls, one-shot animations
assets/js/tiles.js     which art variant each tile gets (shared by game and home replay)
assets/css/sprites.css tile, wall and gnome art placement
assets/sprites/        generated art (29 sprites, icon-gnome.svg, manifest.json). Never hand-edit
tools/build-sprites.mjs  the one source of all art: `node tools/build-sprites.mjs`
tools/sprites.html     dev gallery of every sprite
docs/ART_SPEC.md, docs/MENU_SPEC.md  art and menu specs
assets/js/play/       game UI (main, board, select, storage, lines, daily); calls the engine
assets/js/bars.js     draws a wall bar on a line between tiles (game and home page)
assets/levels/        level packs (pack-01.json), the daily batch (daily.json) and the lab pack (lab.json, rules v4)
assets/js/teaser.js   hero replay (canned, not game logic)
assets/js/teaser-data.js  the replay's level, route and par walls; tools/teaser.test.js checks them against the engine
src/game/             puzzle engine, pure JS, no DOM (Phase 3)
tests/                Playwright browser tests (phone + desktop)
docs/ROADMAP.md       phases and status
docs/GAME_SPEC.md     rules; source of truth for game logic
.claude/skills/       project skills (maze-playtest)
```

## Rules

1. **Spec first.** Game logic follows `docs/GAME_SPEC.md`. If the spec doesn't answer a question, stop and ask. Don't invent rules.
2. **Tests before code** in `src/game/`. Write the failing test, then the code. `npm run test:unit` must pass.
3. **Engine stays pure.** Nothing in `src/game/` touches the DOM, `window` or timers. Randomness takes a seed.
4. **Mobile first.** Design at 390px wide. No horizontal scroll. Touch targets at least 44px.
5. **Relative paths only.** The site is served from `/invisible-maze/`, so `/assets/...` breaks. Use `assets/...` or `../assets/...`.
6. **Colour means something** (the palette doubles as a legend, see `docs/ART_SPEC.md`). Don't reuse these for decoration:
   - Hat red `#c94a32`: the gnome, and the toadstool house he's heading for
   - Timber `#c48a52`: a wall the player placed
   - Gold `#e9b949`: a hint wall (ribbon)
   - Teal `#5ff0d8`, violet `#c79bff`, amber `#ffcf5a`: teleporter pairs 1, 2, 3. Glow only ever means magic
   - Water `#5aa9d6`: river. Log brown `#a0703f`: bridge
   - Stone grey `#9aa3a6`, bush green `#3f7a34`: pre-built, permanent
   - Outline `#3b2618`: every shape. Never black
7. **Verify before claiming done.** Run `npm test`, and for UI changes run the maze-playtest skill and look at the screenshots.
8. **Art is generated.** Change `tools/build-sprites.mjs` and rebuild, never hand-edit `assets/sprites/`.
9. **Small commits on branches.** Open a PR into `main`; CI tests it, merge deploys it.

## Agent roles

| Role | Model | Does | Doesn't |
|---|---|---|---|
| Orchestrator | Opus | Spec, architecture, reviews, merges | Grind out boilerplate |
| Builder | Sonnet | Implements one roadmap parcel against the spec and tests | Change the spec |
| QA | Sonnet, fresh context | Plays the build with maze-playtest, files findings | Fix what it finds (keeps it honest) |

Give a Builder one parcel, the spec section it needs, and the definition of done from the roadmap. Nothing else.

## Commands

```
npm install              once
npm run serve            local site at http://localhost:4173
npm run test:unit        engine tests (node:test)
npm run test:e2e         browser tests (Playwright)
npm test                 both
```
