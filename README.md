# Gnome Sweet Gnome

A mobile-first, fence-building puzzle. A garden gnome is heading home by the shortest path; build wooden fences on the lines between tiles so his walk is too long, using as few fences as you can. Rivers, bridges and hollow stumps (teleporters) get in the way. (The repo and the engine still say `invisible-maze`, robot and beacon.)

**Status:** live at https://gnomesweetgnome.app with the full game (rules v4, 30 levels) and the daily page (Easy and Hard, 5 tries, score out of 100, share card). The stats Worker is deployed but switched off on the page. A review-fix phase is in review. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Run it locally

```
npm install
npm run serve      # http://localhost:4173
npm test           # engine + browser tests
```

## How it ships

Every push to `main` runs the tests and, if they pass, deploys to GitHub Pages. Pull requests are tested but not deployed.

## Working on it with Claude

Start with [CLAUDE.md](CLAUDE.md). Game rules live in [docs/GAME_SPEC.md](docs/GAME_SPEC.md).
