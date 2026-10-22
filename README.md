# Invisible Maze

A mobile-first puzzle game about walls you can't see. Hidden walls, Picross-style edge clues, and a robot with a distance sensor.

**Status:** website live, game in design. See [docs/ROADMAP.md](docs/ROADMAP.md).

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
