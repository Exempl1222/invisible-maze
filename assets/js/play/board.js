// The board: tiles as buttons, walls as bars on the lines between them, the robot, and the
// step-by-step replay of a simulation. No rules here. Which lines take walls and what happens on
// Go come from the engine; this file only turns presses into lines and draws results.
import { ROBOT_SVG } from './icons.js';
import { placeBar } from '../bars.js';
import { pointTarget, lineFor, lineKey, explainLine, wallSidesText } from './lines.js';

const NAMES = { '.': 'Grass', '#': 'Rock', '~': 'River', '=': 'Bridge', R: 'Robot start', B: 'Beacon' };
const CLASS = { '.': 'grass', '#': 'rock', '~': 'river', '=': 'bridge', R: 'start', B: 'beacon' };
const STEP = { U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] };
const ARROWS = { ArrowUp: 'U', ArrowRight: 'R', ArrowDown: 'D', ArrowLeft: 'L' };
const GAP = 3;
const SIDE_MARGIN = 16; // keeps clear of iOS edge swipes
const MAX_BOARD = 560;
const SIDE_COLUMN = 260 + 36; // stats column plus the gap, in the wide layout

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isPortal = (c) => c >= 'a' && c <= 'z';
const el = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };

export function createBoard(root, level, { onLine, onHelp }) {
  root.innerHTML = '';
  root.style.setProperty('--n', level.size);
  root.style.setProperty('--gap', `${GAP}px`);
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', `Level board, ${level.size} by ${level.size}`);
  root.setAttribute('aria-describedby', 'board-help');

  const n = level.size;
  const letters = [...new Set(level.tiles.join('').split('').filter(isPortal))].sort();
  const cells = new Map();
  const key = (x, y) => `${x},${y}`;
  const walls = new Map(); // line key -> { line, bar }
  let robotPos = level.start;
  let focus = level.start; // roving tabindex: one tab stop for the whole board
  let locked = false;
  let press = null; // { id, target, k }
  let hintTimer = 0;
  let linkHold = 0;
  let links = [];

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
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
  const cellAt = (x, y) => cells.get(key(x, y));

  const hint = el('line-hint');
  hint.hidden = true;
  hint.setAttribute('aria-hidden', 'true');
  root.appendChild(hint);

  const robot = el('robot');
  robot.id = 'robot';
  robot.setAttribute('aria-hidden', 'true');
  robot.innerHTML = ROBOT_SVG;
  root.appendChild(robot);

  const hasWall = (line) => walls.has(lineKey(line));

  /* ---------- labels ---------- */

  function name(x, y) {
    const ch = level.tiles[y][x];
    const where = `row ${y + 1} column ${x + 1}`;
    if (isPortal(ch)) {
      const num = letters.length > 1 ? ` ${letters.indexOf(ch) + 1}` : '';
      return `Teleporter${num}, ${where}`;
    }
    if (ch === '.') {
      const ws = wallSidesText(x, y, n, hasWall);
      return `Grass, ${where}${ws ? `, ${ws}` : ''}`;
    }
    return `${NAMES[ch]}, ${where}`;
  }
  const relabel = (x, y) => cellAt(x, y).setAttribute('aria-label', name(x, y));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) relabel(x, y);

  function setFocusable(x, y) {
    cellAt(focus[0], focus[1]).tabIndex = -1;
    focus = [x, y];
    cellAt(x, y).tabIndex = 0;
  }
  setFocusable(focus[0], focus[1]);

  /* ---------- geometry ---------- */

  /** The two tiles beside a line (or one tile and null on the border) as [tile, side, other]. */
  function beside(target) {
    const { x, y, side } = target;
    const [dx, dy] = STEP[side];
    const ox = x + dx;
    const oy = y + dy;
    const other = ox >= 0 && oy >= 0 && ox < n && oy < n ? cellAt(ox, oy) : null;
    return [cellAt(x, y), side, other];
  }
  const targetOf = (line) => (line[2] === 'R' ? { x: line[0], y: line[1], side: 'R' } : { x: line[0], y: line[1], side: 'D' });

  function placeWallBar(w) {
    placeBar(w.bar, root, ...beside(targetOf(w.line)));
  }

  function fit() {
    const wide = window.matchMedia('(min-width: 880px)').matches;
    const vw = document.documentElement.clientWidth;
    const availW = Math.min(MAX_BOARD, vw - 2 * SIDE_MARGIN - (wide ? SIDE_COLUMN : 0));
    const top = root.getBoundingClientRect().top + window.scrollY;
    const availH = window.innerHeight - top - 12;
    const px = Math.floor(Math.max(200, Math.min(availW, availH)));
    (root.parentElement || root).style.setProperty('--board-size', `${px}px`);
    layout();
  }

  function layout() {
    for (const w of walls.values()) placeWallBar(w);
    if (press) showHint(press.target, press.ok ? 'ok' : 'no');
    placeLinks();
    moveRobot(robotPos, { instant: true });
  }

  /* ---------- hint (the line under your finger) ---------- */

  function showHint(target, state, cls = '') {
    clearTimeout(hintTimer);
    placeBar(hint, root, ...beside(target));
    hint.className = `line-hint ${state} ${cls}`.trim();
    hint.dataset.state = state;
    hint.dataset.line = target.line ? lineKey(target.line) : `edge:${target.x},${target.y},${target.side}`;
    hint.hidden = false;
  }
  function hideHint() {
    clearTimeout(hintTimer);
    hint.hidden = true;
    hint.dataset.state = '';
  }
  function flashHint(target, state, ms) {
    showHint(target, state, 'pulse');
    hintTimer = setTimeout(hideHint, ms);
  }

  /* ---------- teleporter links ---------- */

  function placeLink(link) {
    const br = root.getBoundingClientRect();
    const a = cellAt(...link.a).getBoundingClientRect();
    const b = cellAt(...link.b).getBoundingClientRect();
    const ax = a.left + a.width / 2 - br.left;
    const ay = a.top + a.height / 2 - br.top;
    const bx = b.left + b.width / 2 - br.left;
    const by = b.top + b.height / 2 - br.top;
    const len = Math.hypot(bx - ax, by - ay);
    const el = link.el;
    el.style.left = `${ax}px`;
    el.style.top = `${ay}px`;
    el.style.width = `${len}px`;
    el.style.transform = `translateY(-50%) rotate(${Math.atan2(by - ay, bx - ax)}rad)`;
  }
  function placeLinks() { for (const l of links) placeLink(l); }

  function drawLink(a, b, cls) {
    const e = el(`tele-link ${cls}`);
    e.setAttribute('aria-hidden', 'true');
    root.insertBefore(e, hint);
    const link = { a, b, el: e };
    links.push(link);
    placeLink(link);
    return link;
  }
  function removeLink(link) {
    link.el.remove();
    links = links.filter((l) => l !== link);
  }
  /** Pressing, hovering or focusing a teleporter lights up its partner and joins them with a line. */
  function showPair(x, y) {
    clearTimeout(linkHold);
    clearPair();
    const p = level.partner(x, y);
    if (!p) return;
    cellAt(x, y).classList.add('linked');
    cellAt(p[0], p[1]).classList.add('linked');
    drawLink([x, y], p, 'pair');
  }
  function clearPair() {
    clearTimeout(linkHold);
    for (const c of cells.values()) c.classList.remove('linked');
    for (const l of links.filter((k) => k.el.classList.contains('pair'))) removeLink(l);
  }
  const isTeleporterAt = (x, y) => isPortal(level.tiles[y][x]);

  /* ---------- input ---------- */

  function describe(target, via) {
    const e = explainLine(level, target.line, target);
    return { ...target, ok: e.ok, why: e.why, via };
  }

  function targetFromEvent(e) {
    const r = root.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    if (px < 0 || py < 0 || px >= r.width || py >= r.height) return null;
    return pointTarget(px, py, r.width, n, GAP);
  }
  const targetKey = (t) => (t.line ? lineKey(t.line) : `edge:${t.x},${t.y},${t.side}`);

  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = targetFromEvent(e);
    if (!t) return;
    setFocusable(t.x, t.y);
    if (isTeleporterAt(t.x, t.y)) showPair(t.x, t.y);
    if (locked) return;
    const d = describe(t, 'pointer');
    press = { id: e.pointerId, target: d, k: targetKey(d), ok: d.ok };
    try { root.setPointerCapture(e.pointerId); } catch { /* not all browsers allow it */ }
    showHint(d, d.ok ? 'ok' : 'no');
    e.preventDefault();
  });

  root.addEventListener('pointermove', (e) => {
    const t = targetFromEvent(e);
    if (press && e.pointerId === press.id) {
      // Still on the pressed line: show it. Anywhere else: hide it, and releasing there cancels.
      if (t && targetKey(t) === press.k) showHint(press.target, press.ok ? 'ok' : 'no');
      else hideHint();
      return;
    }
    if (e.pointerType !== 'mouse') return;
    if (!t) { hideHint(); clearPair(); return; }
    if (isTeleporterAt(t.x, t.y)) { if (!links.some((l) => l.el.classList.contains('pair'))) showPair(t.x, t.y); } else clearPair();
    if (locked) { hideHint(); return; }
    const d = describe(t, 'pointer');
    showHint(d, d.ok ? 'ok' : 'no', 'hover');
  });

  function endPress(e, commit) {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    press = null;
    try { root.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const t = commit ? targetFromEvent(e) : null;
    const same = t && targetKey(t) === p.k;
    hideHint();
    if (same && !locked) onLine(p.target);
    if (p.target && isTeleporterAt(p.target.x, p.target.y)) {
      // Keep the pair lit a moment after a tap so a thumb doesn't hide it.
      clearTimeout(linkHold);
      linkHold = setTimeout(clearPair, 1200);
    }
  }
  root.addEventListener('pointerup', (e) => endPress(e, true));
  root.addEventListener('pointercancel', (e) => endPress(e, false));
  root.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !press) { hideHint(); if (!root.contains(document.activeElement) || !document.activeElement.matches(':focus-visible')) clearPair(); }
  });

  // Screen readers and switch controls activate a tile with a click that has no position.
  root.addEventListener('click', (e) => {
    if (e.detail === 0 && e.target.closest('.cell') && onHelp) onHelp();
  });

  root.addEventListener('focusin', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    if (isTeleporterAt(x, y)) showPair(x, y); else clearPair();
  });
  root.addEventListener('focusout', (e) => {
    if (!e.relatedTarget || !root.contains(e.relatedTarget)) clearPair();
  });

  // Arrow keys move between tiles. Shift+arrow walls (or unwalls) that side of the focused tile.
  root.addEventListener('keydown', (e) => {
    const side = ARROWS[e.key];
    if (!side) return;
    const cell = e.target.closest('.cell');
    if (!cell) return;
    e.preventDefault();
    const cx = Number(cell.dataset.x);
    const cy = Number(cell.dataset.y);
    if (e.shiftKey) {
      if (locked) return;
      const line = lineFor(cx, cy, side, n);
      const d = describe({ x: cx, y: cy, side, line }, 'key');
      flashHint(d, d.ok ? 'ok' : 'no', 700);
      onLine(d);
      return;
    }
    const [dx, dy] = STEP[side];
    const x = Math.min(n - 1, Math.max(0, cx + dx));
    const y = Math.min(n - 1, Math.max(0, cy + dy));
    setFocusable(x, y);
    cellAt(x, y).focus();
  });

  /* ---------- robot ---------- */

  function moveRobot(pos, { instant = false, ms } = {}) {
    const cell = cellAt(pos[0], pos[1]);
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
    const c = cellAt(pos[0], pos[1]);
    c.classList.add(cls);
    setTimeout(() => c.classList.remove(cls), 600);
  };

  /* ---------- public ---------- */

  const api = {
    cells,
    robot,
    hasWall,
    wallList: () => [...walls.values()].map((w) => w.line),
    setWall(line, on) {
      const k = lineKey(line);
      if (on && !walls.has(k)) {
        const bar = el('wall-bar drop');
        bar.dataset.line = k;
        bar.setAttribute('aria-hidden', 'true');
        root.insertBefore(bar, hint);
        const w = { line, bar };
        walls.set(k, w);
        placeWallBar(w);
      } else if (!on && walls.has(k)) {
        walls.get(k).bar.remove();
        walls.delete(k);
      }
      const t = targetOf(line);
      relabel(t.x, t.y);
      relabel(line[2] === 'R' ? line[0] + 1 : line[0], line[2] === 'D' ? line[1] + 1 : line[1]);
    },
    clearWalls() {
      for (const w of [...walls.values()]) api.setWall(w.line, false);
    },
    /** A refused press: the line goes red and pulses so it can't be missed. */
    refuse(target) {
      flashHint(target, 'no', 1100);
    },
    setLocked(on) {
      locked = on;
      if (on) { press = null; hideHint(); }
      root.classList.toggle('locked', on);
      root.setAttribute('aria-busy', on ? 'true' : 'false');
    },
    /** Put the robot back at the start and wipe trail and effects. Walls stay. */
    resetRun() {
      for (const c of cells.values()) c.classList.remove('trail', 'reached', 'flash', 'linked');
      for (const l of [...links]) removeLink(l);
      robot.classList.remove('jolt', 'vanish');
      moveRobot(level.start, { instant: true });
    },
    fit,
    robotAt: () => robotPos,

    /**
     * Replay a simulate() result. Resolves true when it played to the end, false if
     * cancelled. `instant` skips the animation and jumps to the final frame.
     */
    async play(sim, { stepMs = 300, instant = false, onMove, cancelled = () => false }) {
      api.resetRun();
      const last = sim.steps.length - 1;
      const mark = (pos) => {
        if (pos[0] === level.beacon[0] && pos[1] === level.beacon[1]) return;
        cellAt(pos[0], pos[1]).classList.add('trail');
      };
      const verdict = () => {
        if (sim.result === 'lose') {
          cellAt(level.beacon[0], level.beacon[1]).classList.add('reached');
        } else {
          robot.classList.add('jolt'); // out of moves: the robot stops short of the beacon
        }
      };
      if (instant) {
        for (let i = 0; i <= last; i++) {
          mark(sim.steps[i]);
          if (sim.via[i]) mark(sim.via[i]);
        }
        moveRobot(sim.steps[last], { instant: true });
        if (onMove) onMove(last);
        verdict();
        return true;
      }
      await sleep(350);
      for (let i = 1; i <= last; i++) {
        if (cancelled()) return false;
        mark(sim.steps[i - 1]);
        if (onMove) onMove(i);
        const via = sim.via[i];
        if (via) {
          // Step onto the teleporter, light the pair and join it to its partner, then reappear there.
          moveRobot(via, { ms: stepMs * 0.45 });
          await sleep(stepMs * 0.55);
          if (cancelled()) return false;
          mark(via);
          pulse(via, 'flash');
          pulse(sim.steps[i], 'flash');
          const link = drawLink(via, sim.steps[i], 'jump');
          robot.classList.add('vanish');
          await sleep(stepMs * 0.9);
          if (cancelled()) return false;
          moveRobot(sim.steps[i], { instant: true });
          robot.classList.remove('vanish');
          await sleep(stepMs * 0.6);
          removeLink(link);
        } else {
          moveRobot(sim.steps[i], { ms: stepMs * 0.75 });
          await sleep(stepMs);
        }
      }
      if (cancelled()) return false;
      mark(sim.steps[last]);
      verdict();
      await sleep(450);
      return !cancelled();
    },
  };

  const onResize = () => fit();
  window.addEventListener('resize', onResize);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => fit()) : null;
  if (ro) ro.observe(document.body);
  api.destroy = () => {
    window.removeEventListener('resize', onResize);
    if (ro) ro.disconnect();
    clearTimeout(hintTimer);
    clearTimeout(linkHold);
  };
  moveRobot(level.start, { instant: true });
  return api;
}
