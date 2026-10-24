# Invisible Maze

A mobile-first puzzle game. The robot always takes the shortest route to the beacon; stop it with as few walls as you can. Rivers, bridges and teleporters get in the way. (Invisible Maze is a working title.)

**Status:** website live, rules locked, engine next. See [docs/ROADMAP.md](docs/ROADMAP.md).

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
