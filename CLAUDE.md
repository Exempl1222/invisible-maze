# CLAUDE.md

Handbook for any Claude session or agent working in this repo. Read this first, then `docs/ROADMAP.md` for where things stand.

## What this is

Invisible Maze, a mobile-first puzzle game. Plain HTML, CSS and JavaScript (ES modules). No framework, no build step. Hosted on GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main`.

## Layout

```
index.html            landing page (hero teaser is a canned replay, not game logic)
play/index.html       the game page (placeholder until Phase 4)
assets/css/site.css   all styles; colour tokens on :root
assets/js/teaser.js   hero replay (canned, not game logic)
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
6. **Colour means something.** Amber is the robot and primary actions, cyan is a player wall, lilac is the beacon, pink is a teleporter, blue is river, timber is bridge, slate is rock. Don't reuse them for decoration.
7. **Verify before claiming done.** Run `npm test`, and for UI changes run the maze-playtest skill and look at the screenshots.
8. **Small commits on branches.** Open a PR into `main`; CI tests it, merge deploys it.

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
