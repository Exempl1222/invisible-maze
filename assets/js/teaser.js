// Hero teaser: a canned replay of one level, so visitors see the mechanic
// before the real game exists. This is NOT game logic. The real engine will
// live in /src/game and replace this once Phase 3 lands.

const N = 7;
const START = [0, 6];
const PORTAL = [6, 0];
const WALLS = [[1,5],[2,3],[3,3],[4,1],[5,4],[1,1],[3,5],[6,3],[0,2]];

// Moves the robot tries, in order. A move into a wall is a bump: the wall
// lights up and stays visible, and the robot stays put.
const ATTEMPTS = [
  [0,5],[1,5],[0,4],[1,4],[2,4],[2,3],[3,4],[3,3],[4,4],
  [4,3],[4,2],[4,1],[5,2],[5,1],[6,1],[6,0],
];

const key = ([x, y]) => `${x},${y}`;
const wallSet = new Set(WALLS.map(key));
const distance = ([x, y]) => Math.abs(PORTAL[0] - x) + Math.abs(PORTAL[1] - y);

const ROBOT_SVG = `<svg viewBox="0 0 32 32" aria-hidden="true">
  <rect x="6" y="9" width="20" height="16" rx="5" fill="var(--robot)"/>
  <rect x="10" y="14" width="4" height="4" rx="1" fill="var(--night)"/>
  <rect x="18" y="14" width="4" height="4" rx="1" fill="var(--night)"/>
  <rect x="15" y="3" width="2" height="6" fill="var(--robot)"/>
  <circle cx="16" cy="3" r="2" fill="var(--robot)"/>
</svg>`;

function build(board) {
  board.innerHTML = '';
  const cells = new Map();

  // Corner spacer, then column clues across the top.
  board.appendChild(document.createElement('div'));
  for (let x = 0; x < N; x++) {
    const c = document.createElement('div');
    c.className = 'clue';
    c.textContent = WALLS.filter(([wx]) => wx === x).length;
    board.appendChild(c);
  }

  for (let y = 0; y < N; y++) {
    const rc = document.createElement('div');
    rc.className = 'clue';
    rc.textContent = WALLS.filter(([, wy]) => wy === y).length;
    board.appendChild(rc);
    for (let x = 0; x < N; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (key([x, y]) === key(PORTAL)) cell.classList.add('portal');
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

function place(board, robot, cells, pos) {
  const cell = cells.get(key(pos));
  const b = board.getBoundingClientRect();
  const r = cell.getBoundingClientRect();
  robot.style.width = `${r.width}px`;
  robot.style.height = `${r.height}px`;
  robot.style.left = '0px';
  robot.style.top = '0px';
  robot.style.transform = `translate(${r.left - b.left}px, ${r.top - b.top}px)`;
}

export function startTeaser(board, readout) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let { cells, robot } = build(board);
  let pos = START;
  let step = 0;
  let timer;

  const setReadout = () => { readout.textContent = distance(pos); };
  const reflow = () => place(board, robot, cells, pos);

  function reset() {
    ({ cells, robot } = build(board));
    pos = START;
    step = 0;
    reflow();
    setReadout();
  }

  // Reduced motion: show the solved board as a still picture.
  if (reduced) {
    reset();
    WALLS.forEach((w) => cells.get(key(w)).classList.add('wall'));
    pos = PORTAL;
    reflow();
    setReadout();
    window.addEventListener('resize', reflow);
    return;
  }

  function tick() {
    if (step >= ATTEMPTS.length) {
      timer = setTimeout(() => { reset(); timer = setTimeout(tick, 900); }, 2200);
      return;
    }
    const target = ATTEMPTS[step++];
    const cell = cells.get(key(target));
    if (wallSet.has(key(target))) {
      cell.classList.add('wall', 'bump');
      robot.classList.remove('jolt');
      void robot.offsetWidth; // restart the jolt animation
      robot.classList.add('jolt');
      setTimeout(() => cell.classList.remove('bump'), 450);
      timer = setTimeout(tick, 750);
    } else {
      cells.get(key(pos)).classList.add('trail');
      pos = target;
      reflow();
      setReadout();
      timer = setTimeout(tick, 420);
    }
  }

  reset();
  window.addEventListener('resize', reflow);
  timer = setTimeout(tick, 800);

  // Pause when the tab is hidden so it isn't burning battery in the background.
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (!document.hidden) timer = setTimeout(tick, 400);
  });
}
