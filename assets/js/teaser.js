// Hero teaser: a canned replay of one real level, so visitors see the idea before they play.
// The level, the robot's route and the par walls live in teaser-data.js and are checked against
// the engine by tools/teaser.test.js. This file only draws them. It is not game logic.
//
// Act 1: no walls. The robot takes its shortest route, through a teleporter, to the beacon.
// Act 2: the par answer goes down on the lines between tiles. The robot still has a way through, but a
// long one: it walks until it runs out of moves and stops short of the beacon.
import { TEASER as T } from './teaser-data.js';
import { placeBar } from './bars.js';

const N = T.size;
const MOVE_LIMIT = T.moveLimit;

const TILE_CLASS = { '.': 'grass', '#': 'rock', '~': 'river', '=': 'bridge', R: 'start', B: 'beacon' };
const key = ([x, y]) => `${x},${y}`;
const isPortal = (c) => c >= 'a' && c <= 'z';

const ROBOT_SVG = `<svg viewBox="0 0 32 32" aria-hidden="true">
  <rect x="6" y="9" width="20" height="16" rx="5" fill="var(--robot)"/>
  <rect x="10" y="14" width="4" height="4" rx="1" fill="var(--night)"/>
  <rect x="18" y="14" width="4" height="4" rx="1" fill="var(--night)"/>
  <rect x="15" y="3" width="2" height="6" fill="var(--robot)"/>
  <circle cx="16" cy="3" r="2" fill="var(--robot)"/>
</svg>`;

function build(board) {
  board.innerHTML = '';
  board.style.setProperty('--n', N);
  const cells = new Map();
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const ch = T.tiles[y][x];
      const cell = document.createElement('div');
      cell.className = `cell ${isPortal(ch) ? 'teleporter' : TILE_CLASS[ch]}`;
      board.appendChild(cell);
      cells.set(key([x, y]), cell);
    }
  }
  const robot = document.createElement('div');
  robot.className = 'robot';
  robot.innerHTML = ROBOT_SVG;
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

export function startTeaser(board, caption, movesOut) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let { cells, robot, bars } = build(board);
  let pos = T.start;
  let timer;
  const queue = [];

  const barPlace = (bar, [x, y, dir]) => {
    const other = dir === 'R' ? [x + 1, y] : [x, y + 1];
    placeBar(bar, board, cells.get(key([x, y])), dir, cells.get(key(other)));
  };
  const addWall = (w, animate = true) => {
    const bar = document.createElement('div');
    bar.className = `wall-bar${animate ? ' drop' : ''}`;
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

  function script() {
    // Act 1: free run.
    later(0, () => { reset(); say('No walls. The robot takes the shortest route.'); });
    T.route.forEach((step, i) => {
      const teleport = i + 1 === T.jump.move;
      later(i === 0 ? 1200 : teleport ? 700 : 430, () => {
        cells.get(key(pos)).classList.add('trail');
        if (teleport) {
          // Step onto the teleporter, flash it, reappear at its partner.
          cells.get(key(T.jump.from)).classList.add('flash', 'trail');
          cells.get(key(T.jump.to)).classList.add('flash');
          robot.classList.add('blink');
          setTimeout(() => robot.classList.remove('blink'), 360);
        }
        pos = step;
        place(board, robot, cells, pos, teleport);
        moves(MOVE_LIMIT - (i + 1));
      });
    });
    later(500, () => {
      cells.get(key(T.beacon)).classList.add('reached');
      say(`Through the teleporter. Beacon reached in ${T.route.length} moves.`);
    });

    // Act 2: the par walls, no way through.
    later(2600, () => { reset(); say(`Now place ${T.walls.length} walls on the lines between tiles.`); });
    T.walls.forEach((w, i) => {
      later(i === 0 ? 900 : 550, () => addWall(w));
    });
    later(900, () => say('The robot still has a way through. It is a long one.'));
    T.detour.forEach((step, i) => {
      later(i === 0 ? 700 : 330, () => {
        cells.get(key(pos)).classList.add('trail');
        pos = step;
        place(board, robot, cells, pos);
        moves(MOVE_LIMIT - (i + 1));
      });
    });
    later(300, () => {
      robot.classList.add('jolt');
      say(`Out of moves after ${MOVE_LIMIT}. The route is longer than that.`);
    });
    later(3200, () => {});
  }

  // Reduced motion: a still picture of the solved level.
  if (reduced) {
    reset();
    T.walls.forEach((w) => addWall(w, false));
    say(`${T.walls.length} walls make the route longer than ${MOVE_LIMIT} moves. The robot runs out of moves.`);
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
