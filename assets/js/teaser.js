// Hero teaser: a canned replay of one real level, so visitors see the idea before they play.
// The level, the robot's route and the par walls live in teaser-data.js and are checked against
// the engine by tools/teaser.test.js. This file only draws them. It is not game logic.
//
// Act 1: no fences. The gnome takes his shortest route, through a stump, to his house.
// Act 2: three fences go up on the lines between tiles. He still has a way through, but a long
// one: he walks until he runs out of moves and stops short of home. Art comes from sprites.js and
// sprites.css, the same files the game uses.
import { TEASER as T } from './teaser-data.js';
import { placeBar } from './bars.js';
import { decorateTile, portalLetters } from './tiles.js';
import { preloadSprites, sprite, setGnome, playOnce, DIR_OF_STEP } from './sprites.js';

const N = T.size;
const MOVE_LIMIT = T.moveLimit;

const TILE_CLASS = { '.': 'grass', '#': 'rock', '~': 'river', '=': 'bridge', R: 'start', B: 'beacon' };
const key = ([x, y]) => `${x},${y}`;
const isPortal = (c) => c >= 'a' && c <= 'z';
const LETTERS = portalLetters(T.tiles);

/** Which way the gnome faces moving from tile `from` to tile `to` (the engine's U R D L). */
function dirBetween(from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : dx < 0 ? 'left' : null;
  return DIR_OF_STEP[dy > 0 ? 'D' : 'U'];
}

let artReady = false; // false if the sprites could not load: the board still shows, as plain tiles

function build(board) {
  board.innerHTML = '';
  board.style.setProperty('--n', N);
  const cells = new Map();
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const ch = T.tiles[y][x];
      const cell = document.createElement('div');
      cell.className = `cell ${isPortal(ch) ? 'teleporter' : TILE_CLASS[ch]}`;
      decorateTile(cell, T.tiles, N, x, y, LETTERS);
      board.appendChild(cell);
      cells.set(key([x, y]), cell);
    }
  }
  const robot = document.createElement('div');
  robot.className = 'robot';
  if (artReady) setGnome(robot, 'down', 'idle');
  board.appendChild(robot);
  return { cells, robot, bars: [] };
}

function place(board, robot, cells, pos, instant = false) {
  const cell = cells.get(key(pos));
  const b = board.getBoundingClientRect();
  const r = cell.getBoundingClientRect();
  if (instant) robot.style.transition = 'none';
  robot.style.width = `${r.width}px`;
  robot.style.height = `${r.height}px`;
  robot.style.transform = `translate(${r.left - b.left}px, ${r.top - b.top}px)`;
  if (instant) { void robot.offsetWidth; robot.style.transition = ''; }
}

export async function startTeaser(board, caption, movesOut) {
  try { await preloadSprites(); artReady = true; } catch { artReady = false; }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let { cells, robot, bars } = build(board);
  let pos = T.start;
  let timer;
  const queue = [];

  const barPlace = (bar, [x, y, dir]) => {
    const other = dir === 'R' ? [x + 1, y] : [x, y + 1];
    placeBar(bar, board, cells.get(key([x, y])), dir, cells.get(key(other)));
  };
  const addWall = (w) => {
    const bar = document.createElement('div');
    bar.className = 'wall-bar';
    const dir = w[2] === 'D' ? 'h' : 'v';
    bar.dataset.dir = dir;
    if (artReady) bar.appendChild(sprite(`wall-${dir}`, 'wall-art'));
    else bar.style.background = 'var(--wall)';
    board.insertBefore(bar, robot);
    barPlace(bar, w);
    bars.push([bar, w]);
  };
  const reflow = () => {
    place(board, robot, cells, pos, true);
    for (const [bar, w] of bars) barPlace(bar, w);
  };
  const say = (text) => { caption.textContent = text; };
  const moves = (n) => { movesOut.textContent = n; };
  const later = (ms, fn) => queue.push([ms, fn]);

  function run() {
    if (!queue.length) { script(); }
    const [ms, fn] = queue.shift();
    timer = setTimeout(() => { fn(); run(); }, ms);
  }

  function reset() {
    ({ cells, robot, bars } = build(board));
    pos = T.start;
    place(board, robot, cells, pos, true);
    moves(MOVE_LIMIT);
  }

  let facing = 'down';
  /** Turn the gnome toward `to` and start the walk cycle (a no-op when nothing changed). */
  const walkTo = (to) => {
    facing = dirBetween(pos, to) || facing;
    if (artReady) setGnome(robot, facing, 'walk');
  };

  function script() {
    // Act 1: free run.
    later(0, () => { reset(); facing = 'down'; say('No fences. The gnome takes the shortest path home.'); });
    T.route.forEach((step, i) => {
      const teleport = i + 1 === T.jump.move;
      // The step after the jump waits for the dive (560ms) and the pop (520ms) to finish.
      const afterJump = i === T.jump.move;
      later(i === 0 ? 1200 : afterJump ? 1500 : 430, () => {
        cells.get(key(pos)).classList.add('trail');
        if (teleport) {
          // Walk onto the stump, hop in and sink, then pop out of its twin.
          walkTo(T.jump.from);
          place(board, robot, cells, T.jump.from);
          moves(MOVE_LIMIT - (i + 1));
          const rb = robot; // a restart (tab hidden, then shown) builds a new board: let this one finish alone
          const cs = cells;
          setTimeout(async () => {
            cs.get(key(T.jump.from)).classList.add('trail');
            await playOnce(rb, 'dive', 560, { keep: true });
            if (rb !== robot) return;
            cs.get(key(T.jump.from)).classList.add('flash');
            cs.get(key(T.jump.to)).classList.add('flash');
            pos = step;
            place(board, robot, cells, pos, true);
            rb.classList.remove('dive');
            await playOnce(rb, 'pop', 520);
          }, 300);
          return;
        }
        walkTo(step);
        pos = step;
        place(board, robot, cells, pos);
        moves(MOVE_LIMIT - (i + 1));
      });
    });
    later(500, () => {
      cells.get(key(T.beacon)).classList.add('reached');
      if (artReady) setGnome(robot, facing, 'idle');
      playOnce(robot, 'home', 600, { keep: true }); // steps up to the door and in
      say(`Through the stump. Home in ${T.route.length} moves.`);
    });

    // Act 2: the par fences, no way through.
    later(2600, () => { reset(); facing = 'down'; say(`Now build ${T.walls.length} fences on the lines between tiles.`); });
    T.walls.forEach((w, i) => {
      later(i === 0 ? 900 : 550, () => addWall(w));
    });
    later(900, () => say('He still has a way through. It is a long one.'));
    T.detour.forEach((step, i) => {
      later(i === 0 ? 700 : 330, () => {
        cells.get(key(pos)).classList.add('trail');
        walkTo(step);
        pos = step;
        place(board, robot, cells, pos);
        moves(MOVE_LIMIT - (i + 1));
      });
    });
    later(300, () => {
      if (artReady) setGnome(robot, facing, 'shrug');
      say(`Out of moves after ${MOVE_LIMIT}. The route is longer than that.`);
    });
    later(3200, () => {});
  }

  // Reduced motion: a still picture of the solved level.
  if (reduced) {
    reset();
    T.walls.forEach((w) => addWall(w));
    say(`${T.walls.length} fences make the route longer than ${MOVE_LIMIT} moves. The gnome runs out of moves.`);
    window.addEventListener('resize', reflow);
    return;
  }

  reset();
  window.addEventListener('resize', reflow);
  script();
  run();

  // Pause when the tab is hidden so it doesn't burn battery in the background.
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (!document.hidden) { queue.length = 0; script(); run(); }
  });
}
