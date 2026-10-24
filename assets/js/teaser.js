// Hero teaser: a canned replay of one real level, so visitors see the idea
// before the game exists. Paths were computed offline by the prototype solver.
// This is NOT game logic; the engine will live in /src/game (Phase 3).
//
// Act 1: no walls. The robot takes its shortest route, through a teleporter,
//        and reaches the beacon in 9 moves.
// Act 2: three walls go down. Every route to the beacon is cut, so the robot
//        has nowhere to go.

const LEVEL = [
  '.....=~..',
  '......~..',
  '......~..',
  '......=..',
  '...#..~..',
  '......=..',
  '......=..',
  '...#..~~.',
  'T...#..~T',
];
const N = LEVEL.length;
const START = [2, 2];
const BEACON = [8, 7];
const MOVE_LIMIT = 13;
const PAR_WALLS = [[8, 6], [0, 7], [1, 8]];
// Act 1 route. The step from [0,7] onto the teleporter at [0,8] lands on [8,8].
const ROUTE = [[1,2],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[8,8],[8,7]];
const TELEPORT_FROM = [0, 8];

const TILE_CLASS = { '.': 'grass', '#': 'rock', '~': 'river', '=': 'bridge', T: 'teleporter' };
const key = ([x, y]) => `${x},${y}`;

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
      const cell = document.createElement('div');
      cell.className = `cell ${TILE_CLASS[LEVEL[y][x]]}`;
      if (key([x, y]) === key(BEACON)) cell.classList.add('beacon');
      board.appendChild(cell);
      cells.set(key([x, y]), cell);
    }
  }
  const robot = document.createElement('div');
  robot.className = 'robot';
  robot.innerHTML = ROBOT_SVG;
  board.appendChild(robot);
  return { cells, robot };
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
  let { cells, robot } = build(board);
  let pos = START;
  let timer;
  const queue = [];

  const reflow = () => place(board, robot, cells, pos, true);
  const say = (text) => { caption.textContent = text; };
  const moves = (n) => { movesOut.textContent = n; };
  const later = (ms, fn) => queue.push([ms, fn]);

  function run() {
    if (!queue.length) { script(); }
    const [ms, fn] = queue.shift();
    timer = setTimeout(() => { fn(); run(); }, ms);
  }

  function reset() {
    ({ cells, robot } = build(board));
    pos = START;
    place(board, robot, cells, pos, true);
    moves(MOVE_LIMIT);
  }

  function script() {
    // Act 1: free run.
    later(0, () => { reset(); say('No walls. The robot takes the shortest route.'); });
    ROUTE.forEach((step, i) => {
      const teleport = i > 0 && key(ROUTE[i - 1]) === '0,7';
      later(i === 0 ? 1200 : 430, () => {
        const here = cells.get(key(pos));
        if (here.classList.contains('grass')) here.classList.add('trail');
        if (teleport) {
          cells.get(key(TELEPORT_FROM)).classList.add('flash');
          robot.classList.add('blink');
          setTimeout(() => robot.classList.remove('blink'), 360);
        }
        pos = step;
        place(board, robot, cells, pos, teleport);
        moves(MOVE_LIMIT - (i + 1));
      });
    });
    later(500, () => { cells.get(key(BEACON)).classList.add('reached'); say('Through the teleporter. Beacon reached in 9 moves.'); });

    // Act 2: three walls, no way through.
    later(2600, () => { reset(); say('Now place three walls.'); });
    PAR_WALLS.forEach((w, i) => {
      later(i === 0 ? 900 : 550, () => cells.get(key(w)).classList.add('wall', 'drop'));
    });
    later(900, () => {
      robot.classList.add('jolt');
      say('Every route is cut. The robot is stuck.');
    });
    later(3200, () => {});
  }

  // Reduced motion: a still picture of the solved level.
  if (reduced) {
    reset();
    PAR_WALLS.forEach((w) => cells.get(key(w)).classList.add('wall'));
    say('Three walls cut every route. The robot is stuck.');
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
