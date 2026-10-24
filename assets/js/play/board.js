// The board: tiles as buttons, the robot, and the step-by-step replay of a simulation.
// No rules here. Which tiles take walls and what happens on Go come from the engine.
import { ROBOT_SVG } from './icons.js';

const NAMES = { '.': 'Grass', '#': 'Rock', '~': 'River', '=': 'Bridge', R: 'Robot start', B: 'Beacon' };
const CLASS = { '.': 'grass', '#': 'rock', '~': 'river', '=': 'bridge', R: 'start', B: 'beacon' };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isPortal = (c) => c >= 'a' && c <= 'z';

export function createBoard(root, level, { onTap }) {
  root.innerHTML = '';
  root.style.setProperty('--n', level.size);
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', `Level board, ${level.size} by ${level.size}`);

  const letters = [...new Set(level.tiles.join('').split('').filter(isPortal))].sort();
  const cells = new Map();
  const key = (x, y) => `${x},${y}`;
  const walls = new Set();
  let robotPos = level.start;
  let focus = level.start; // roving tabindex: one tab stop for the whole board

  for (let y = 0; y < level.size; y++) {
    for (let x = 0; x < level.size; x++) {
      const ch = level.tiles[y][x];
      const portal = isPortal(ch);
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.x = x;
      b.dataset.y = y;
      b.className = `cell ${portal ? 'teleporter' : CLASS[ch]}`;
      b.dataset.tile = portal ? 'teleporter' : CLASS[ch];
      b.tabIndex = -1;
      if (portal && letters.length > 1) {
        b.textContent = String(letters.indexOf(ch) + 1);
        b.dataset.pair = ch;
      }
      cells.set(key(x, y), b);
      root.appendChild(b);
    }
  }

  const robot = document.createElement('div');
  robot.className = 'robot';
  robot.id = 'robot';
  robot.setAttribute('aria-hidden', 'true');
  robot.innerHTML = ROBOT_SVG;
  root.appendChild(robot);

  function name(x, y) {
    const ch = level.tiles[y][x];
    const where = `row ${y + 1} column ${x + 1}`;
    if (isPortal(ch)) {
      const n = letters.length > 1 ? ` ${letters.indexOf(ch) + 1}` : '';
      return `Teleporter${n}, ${where}`;
    }
    if (ch === '.') return `Grass, ${where}${walls.has(key(x, y)) ? ', wall placed' : ''}`;
    return `${NAMES[ch]}, ${where}`;
  }
  const relabel = (x, y) => cells.get(key(x, y)).setAttribute('aria-label', name(x, y));
  for (let y = 0; y < level.size; y++) for (let x = 0; x < level.size; x++) relabel(x, y);

  function setFocusable(x, y) {
    cells.get(key(focus[0], focus[1])).tabIndex = -1;
    focus = [x, y];
    cells.get(key(x, y)).tabIndex = 0;
  }
  setFocusable(focus[0], focus[1]);

  // Taps go to the caller, which decides what's allowed.
  root.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    setFocusable(x, y);
    onTap(x, y, cell);
  });
  // Arrow keys move between tiles; Tab leaves the board.
  root.addEventListener('keydown', (e) => {
    const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (!d) return;
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const x = Math.min(level.size - 1, Math.max(0, Number(cell.dataset.x) + d[0]));
    const y = Math.min(level.size - 1, Math.max(0, Number(cell.dataset.y) + d[1]));
    e.preventDefault();
    setFocusable(x, y);
    cells.get(key(x, y)).focus();
  });

  function moveRobot(pos, { instant = false, ms } = {}) {
    const cell = cells.get(key(pos[0], pos[1]));
    const b = root.getBoundingClientRect();
    const r = cell.getBoundingClientRect();
    if (instant) robot.style.transition = 'none';
    else if (ms != null) robot.style.transitionDuration = `${ms}ms`;
    robot.style.width = `${r.width}px`;
    robot.style.height = `${r.height}px`;
    robot.style.transform = `translate(${r.left - b.left}px, ${r.top - b.top}px)`;
    robot.dataset.x = pos[0];
    robot.dataset.y = pos[1];
    if (instant) { void robot.offsetWidth; robot.style.transition = ''; }
    robotPos = pos;
  }

  const pulse = (pos, cls) => {
    const c = cells.get(key(pos[0], pos[1]));
    c.classList.add(cls);
    setTimeout(() => c.classList.remove(cls), 420);
  };

  const api = {
    cells,
    robot,
    hasWall: (x, y) => walls.has(key(x, y)),
    wallList: () => [...walls].map((k) => k.split(',').map(Number)),
    setWall(x, y, on) {
      const c = cells.get(key(x, y));
      if (on) { walls.add(key(x, y)); c.classList.add('wall', 'drop'); } else { walls.delete(key(x, y)); c.classList.remove('wall', 'drop'); }
      relabel(x, y);
    },
    clearWalls() {
      for (const k of [...walls]) { const [x, y] = k.split(',').map(Number); api.setWall(x, y, false); }
    },
    nope(x, y) {
      const c = cells.get(key(x, y));
      c.classList.remove('nope');
      void c.offsetWidth;
      c.classList.add('nope');
    },
    setLocked(on) {
      root.classList.toggle('locked', on);
      root.setAttribute('aria-busy', on ? 'true' : 'false');
    },
    /** Put the robot back at the start and wipe trail and effects. Walls stay. */
    resetRun() {
      for (const c of cells.values()) c.classList.remove('trail', 'reached', 'flash');
      robot.classList.remove('jolt', 'vanish');
      moveRobot(level.start, { instant: true });
    },
    reflow: () => moveRobot(robotPos, { instant: true }),
    robotAt: () => robotPos,

    /**
     * Replay a simulate() result. Resolves true when it played to the end, false if
     * cancelled. `instant` skips the animation and jumps to the final frame.
     */
    async play(sim, { stepMs = 300, instant = false, onMove, cancelled = () => false }) {
      api.resetRun();
      const last = sim.steps.length - 1;
      const leave = (pos) => {
        const c = cells.get(key(pos[0], pos[1]));
        if (c.classList.contains('grass') || c.classList.contains('start')) c.classList.add('trail');
      };
      const finish = () => {
        if (sim.result === 'lose') cells.get(key(level.beacon[0], level.beacon[1])).classList.add('reached');
        else robot.classList.add('jolt');
      };
      if (instant) {
        for (let i = 0; i < last; i++) leave(sim.steps[i]);
        moveRobot(sim.steps[last], { instant: true });
        if (onMove) onMove(last);
        finish();
        return true;
      }
      await sleep(350);
      for (let i = 1; i <= last; i++) {
        if (cancelled()) return false;
        leave(sim.steps[i - 1]);
        if (onMove) onMove(i);
        const via = sim.via[i];
        if (via) {
          // Walk onto the teleporter, vanish there, reappear at the partner.
          moveRobot(via, { ms: stepMs * 0.4 });
          await sleep(stepMs * 0.45);
          if (cancelled()) return false;
          pulse(via, 'flash');
          robot.classList.add('vanish');
          await sleep(stepMs * 0.2);
          moveRobot(sim.steps[i], { instant: true });
          pulse(sim.steps[i], 'flash');
          robot.classList.remove('vanish');
          await sleep(stepMs * 0.35);
        } else {
          moveRobot(sim.steps[i], { ms: stepMs * 0.75 });
          await sleep(stepMs);
        }
      }
      if (cancelled()) return false;
      finish();
      await sleep(450);
      return !cancelled();
    },
  };

  requestAnimationFrame(() => api.reflow());
  const onResize = () => api.reflow();
  window.addEventListener('resize', onResize);
  api.destroy = () => window.removeEventListener('resize', onResize);
  moveRobot(level.start, { instant: true });
  return api;
}
