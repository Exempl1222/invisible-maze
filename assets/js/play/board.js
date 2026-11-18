// The board: tiles as buttons, walls as bars on the lines between them, the robot, and the
// step-by-step replay of a simulation. No rules here. Which lines take walls and what happens on
// Go come from the engine; this file only turns presses into lines and draws results.
import { sprite, setGnome, playOnce, DIR_OF_STEP } from '../sprites.js';
import { placeBar } from '../bars.js';
import { decorateTile } from '../tiles.js';
import { pointTarget, lineFor, lineKey, explainLine, wallSidesText } from './lines.js';

const NAMES = { '.': 'Grass', '#': 'Rock', '~': 'River', '=': 'Bridge', R: 'Gnome start', B: 'House', '*': 'Ice', '&': 'Mud' };
const CLASS = { '.': 'grass', '#': 'rock', '~': 'river', '=': 'bridge', R: 'start', B: 'beacon', '*': 'ice', '&': 'mud', '>': 'gate', '<': 'gate', '^': 'gate', v: 'gate' };
// Rules v5 gates: the way the arrow points, as the sprite direction letter and the words for a label.
const GATE = { '>': ['r', 'right'], '<': ['l', 'left'], '^': ['u', 'up'], v: ['d', 'down'] };
const STEP = { U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] };
const ARROWS = { ArrowUp: 'U', ArrowRight: 'R', ArrowDown: 'D', ArrowLeft: 'L' };
const GAP = 3;
const SIDE_MARGIN = 16; // keeps clear of iOS edge swipes
const MAX_BOARD = 560;
const SIDE_COLUMN = 260 + 36; // stats column plus the gap, in the wide layout
const TOAD_ASPECT = 140 / 390; // the back sprites' canvas: height over width. He is always as wide as the board
const TOAD_OVERLAP = 0.18; // his hands overlap the board's bottom edge by this share of his height

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isLetter = (c) => c >= 'a' && c <= 'z';
const el = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };
const span = (cls) => { const d = document.createElement('span'); d.className = cls; return d; }; // inside a tile button, which may only hold phrasing content

export function createBoard(root, level, { onLine, onHelp }) {
  root.innerHTML = '';
  root.style.setProperty('--n', level.size);
  root.style.setProperty('--gap', `${GAP}px`);
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', `Level board, ${level.size} by ${level.size}`);
  root.setAttribute('aria-describedby', 'board-help');
  root.setAttribute('aria-busy', 'false'); // true only while the gnome walks (see play), not merely while locked
  let walking = 0; // replays in flight: a cut-short one may still be winding down when the next starts

  const n = level.size;
  const v5 = level.rules === 'v5';
  const isPortal = (c) => isLetter(c) && !(v5 && c === 'v'); // in v5 the letter v is the down gate
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
      decorateTile(b, level.tiles, n, x, y, letters, level.rules);
      if (GATE[ch] && v5) {
        // The door leaf is a CSS shape so it can swing open and shut (assets/css/sprites.css).
        b.dataset.gate = GATE[ch][0];
        const frame = span('gate-frame');
        frame.setAttribute('aria-hidden', 'true');
        frame.appendChild(span('gate-leaf'));
        b.appendChild(frame);
      }
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
  setGnome(robot, 'down', 'idle');
  root.appendChild(robot);

  const hasWall = (line) => walls.has(lineKey(line));

  /* ---------- labels ---------- */

  function name(x, y) {
    const ch = level.tiles[y][x];
    const where = `row ${y + 1} column ${x + 1}`;
    if (isPortal(ch)) {
      const num = letters.length > 1 ? ` ${letters.indexOf(ch) + 1}` : '';
      return `Stump${num}, ${where}`;
    }
    if (ch === '.' || ch === '*' || ch === '&' || GATE[ch]) {
      const ws = wallSidesText(x, y, n, hasWall);
      const what = GATE[ch] ? `Gate, one way ${GATE[ch][1]}` : NAMES[ch];
      return `${what}, ${where}${ws ? `, ${ws}` : ''}`;
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
    const host = root.parentElement || root;
    let px;
    if (host.querySelector(':scope > .villain')) {
      const seen = 1 - TOAD_OVERLAP;
      if (!wide) {
        // Phones: the board is sized as it always was; he is as wide as it is.
        px = Math.floor(Math.max(200, Math.min(availW, availH)));
      } else {
        // Desktop: his visible height (height less the overlap) comes out of the window height so he is fully visible.
        px = Math.floor(Math.max(200, Math.min(availW, availH / (1 + seen * TOAD_ASPECT))));
      }
      host.style.setProperty('--villain-h', `${(px * TOAD_ASPECT).toFixed(2)}px`);
    } else {
      px = Math.floor(Math.max(200, Math.min(availW, availH)));
    }
    host.style.setProperty('--board-size', `${px}px`);
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

  let lastPointerEnd = -Infinity; // the click a browser fires after a tap must not count as screen-reader activation

  function endPress(e, commit) {
    if (!press || e.pointerId !== press.id) return;
    lastPointerEnd = performance.now();
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
    if (performance.now() - lastPointerEnd < 800) return; // follow-up click from a tap we already handled
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

  /** The one-shot spell on a fresh fence: a `.magic` class (lime glow) and four confetti bits, gone after 600ms. */
  function castMagic(bar) {
    const fx = el('magic-fx');
    fx.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i++) fx.appendChild(el('bit'));
    bar.classList.add('magic');
    bar.appendChild(fx);
    setTimeout(() => { bar.classList.remove('magic'); fx.remove(); }, 600);
  }

  /* ---------- public ---------- */

  const api = {
    cells,
    robot,
    hasWall,
    wallList: () => [...walls.values()].map((w) => w.line),
    /** True if the wall on this line was placed by a hint (it can't be taken back). */
    isHintWall: (line) => walls.get(lineKey(line))?.hint === true,
    hintLines: () => [...walls.values()].filter((w) => w.hint).map((w) => w.line),
    /**
     * Place or remove a wall. `hint: true` draws it in the hint style; hint walls are only removed with force.
     * `magic: true` is for a fence the player just placed: Sir Croakwell's lime glow and confetti, once (600ms).
     */
    setWall(line, on, { hint: isHint = false, force = false, magic = false } = {}) {
      const k = lineKey(line);
      if (!on && walls.get(k)?.hint && !force) return;
      if (on && !walls.has(k)) {
        const bar = el(isHint ? 'wall-bar hinted drop' : 'wall-bar drop');
        bar.dataset.line = k;
        const dir = line[2] === 'D' ? 'h' : 'v';
        bar.dataset.dir = dir;
        bar.appendChild(sprite(`wall-${dir}${isHint ? '-hint' : ''}`, 'wall-art'));
        if (isHint) bar.dataset.hint = '1';
        bar.setAttribute('aria-hidden', 'true');
        root.insertBefore(bar, hint); // `hint` here is the line-highlight element: walls sit under it
        const w = { line, bar, hint: isHint };
        walls.set(k, w);
        placeWallBar(w);
        if (magic) castMagic(bar);
      } else if (!on && walls.has(k)) {
        walls.get(k).bar.remove();
        walls.delete(k);
      }
      const t = targetOf(line);
      relabel(t.x, t.y);
      relabel(line[2] === 'R' ? line[0] + 1 : line[0], line[2] === 'D' ? line[1] + 1 : line[1]);
    },
    /** Removes the player's walls. Hint walls stay for the attempt (pass `all` to wipe them too). */
    clearWalls({ all = false } = {}) {
      for (const w of [...walls.values()]) api.setWall(w.line, false, { force: all });
    },
    /** A refused press: the line goes red and pulses so it can't be missed. */
    refuse(target) {
      flashHint(target, 'no', 1100);
    },
    setLocked(on) {
      locked = on;
      if (on) { press = null; hideHint(); }
      root.classList.toggle('locked', on);
    },
    /** Put the robot back at the start and wipe trail and effects. Walls stay. */
    resetRun() {
      for (const c of cells.values()) c.classList.remove('trail', 'reached', 'flash', 'linked', 'gate-open', 'crumble', 'dug');
      for (const f of root.querySelectorAll('.tool-prop, .tool-chip')) f.remove();
      for (const l of [...links]) removeLink(l);
      for (const f of root.querySelectorAll('.frost, .mud-bubble')) f.remove();
      robot.style.transitionTimingFunction = '';
      robot.classList.remove('jolt', 'vanish', 'dive', 'pop', 'home', 'skid', 'bump', 'sink', 'wiggle', 'pull', 'hop');
      setGnome(robot, 'down', 'idle');
      moveRobot(level.start, { instant: true });
    },
    fit,
    robotAt: () => robotPos,

    /**
     * Replay a simulate() result. Resolves true when it played to the end, false if
     * cancelled. `instant` skips the animation and jumps to the final frame.
     */
    async play(sim, opts) {
      walking++;
      root.setAttribute('aria-busy', 'true');
      try {
        return await replay(sim, opts);
      } finally {
        if (--walking === 0) root.setAttribute('aria-busy', 'false');
      }
    },
  };

  async function replay(sim, { stepMs = 300, instant = false, onMove, cancelled = () => false }) {
    api.resetRun();
    const last = sim.steps.length - 1;
    const mark = (pos) => {
      if (pos[0] === level.beacon[0] && pos[1] === level.beacon[1]) return;
      cellAt(pos[0], pos[1]).classList.add('trail');
    };
    let lastDir = 'down';
    const face = (from, to) => {
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const d = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'R' : dx < 0 ? 'L' : null) : (dy > 0 ? 'D' : 'U');
      if (d) lastDir = DIR_OF_STEP[d];
      return lastDir;
    };
    const verdict = () => {
      if (sim.result === 'lose') {
        cellAt(level.beacon[0], level.beacon[1]).classList.add('reached');
        playOnce(robot, 'home', 600, { keep: true }); // runs while the tail sleep below counts down
      } else {
        setGnome(robot, lastDir, 'shrug'); // out of moves: the gnome stops short of the house
      }
    };
    if (instant) {
      for (let i = 0; i <= last; i++) {
        mark(sim.steps[i]);
        if (sim.via[i]) mark(sim.via[i]);
        if (sim.trails) for (const t of sim.trails[i]) mark(t); // rules v5: every tile a slide passed
      }
      for (let i = 1; i <= last; i++) face(sim.steps[i - 1], sim.via[i] || sim.steps[i]); // a jump faces the stump he walked onto
      if (sim.toolUse && sim.toolStep != null && sim.toolUse.tool === 'pickaxe') cellAt(sim.toolUse.tile[0], sim.toolUse.tile[1]).classList.add('dug'); // the rock is cleared, no motion
      setGnome(robot, lastDir, 'idle');
      moveRobot(sim.steps[last], { instant: true });
      if (onMove) onMove(last);
      if (sim.result === 'lose') {
        cellAt(level.beacon[0], level.beacon[1]).classList.add('reached');
        robot.classList.add('home');
      } else setGnome(robot, lastDir, 'shrug');
      return true;
    }
    const tileAt = (pos) => level.tiles[pos[1]][pos[0]];
    const isGateAt = (pos) => v5 && !!GATE[tileAt(pos)];
    const openGate = (pos) => cellAt(pos[0], pos[1]).classList.add('gate-open');
    /** The gate swings shut behind him: every open gate he is no longer standing on. */
    const shutGates = (at) => {
      for (const c of cells.values()) {
        if (c.classList.contains('gate-open') && !(Number(c.dataset.x) === at[0] && Number(c.dataset.y) === at[1])) c.classList.remove('gate-open');
      }
    };
    /** Teleport, from the stump he stands on: dive, then pop out of the twin. Dive and pop scale with the step time. */
    const teleportFrom = async (i, via, ms) => {
      const diveMs = Math.round(ms * 2.55);
      const popMs = Math.round(ms * 2.36);
      robot.style.setProperty('--dive-ms', `${diveMs}ms`);
      robot.style.setProperty('--pop-ms', `${popMs}ms`);
      await playOnce(robot, 'dive', diveMs, { keep: true });
      if (cancelled()) { robot.classList.remove('dive'); return; }
      pulse(via, 'flash');
      pulse(sim.steps[i], 'flash');
      const link = drawLink(via, sim.steps[i], 'jump');
      moveRobot(sim.steps[i], { instant: true });
      robot.classList.remove('dive');
      await playOnce(robot, 'pop', popMs);
      removeLink(link);
    };
    /** Ice: one continuous glide along the whole trail, a skid pose, a spray of frost, a bump if a fence or rock stops him on ice. */
    const glide = async (from, trail, ms) => {
      const to = trail[trail.length - 1];
      setGnome(robot, face(from, to), 'idle');
      const dur = Math.round(ms * (0.35 + 0.2 * trail.length));
      robot.style.setProperty('--glide-ms', `${dur}ms`);
      robot.classList.add('skid');
      robot.style.transitionTimingFunction = 'cubic-bezier(.25,.6,.45,1)';
      const fx = el('frost');
      fx.setAttribute('aria-hidden', 'true');
      for (let k = 0; k < 5; k++) fx.appendChild(el('bit'));
      robot.appendChild(fx);
      moveRobot(to, { ms: dur });
      await sleep(dur);
      robot.style.transitionTimingFunction = '';
      robot.classList.remove('skid');
      fx.remove();
      for (const t of trail) mark(t);
      if (cancelled()) return;
      if (tileAt(to) === '*') await playOnce(robot, 'bump', Math.round(ms * 0.7)); // stopped on ice: a fence or an obstacle is in the way
    };
    /** Mud: he sinks in (lower, squashed) as he arrives, stays down while stuck, then pulls free. */
    const sinkIn = () => { robot.classList.add('sink'); };
    const struggle = async (at, ms) => {
      const cell = cellAt(at[0], at[1]);
      const bubble = span('mud-bubble');
      bubble.setAttribute('aria-hidden', 'true');
      cell.appendChild(bubble);
      robot.classList.add('wiggle');
      await sleep(Math.round(ms * 1.1));
      robot.classList.remove('wiggle');
      bubble.remove();
    };
    const leaveMud = (ms) => {
      if (!robot.classList.contains('sink')) return;
      robot.classList.remove('sink');
      robot.classList.add('pull');
      setTimeout(() => robot.classList.remove('pull'), Math.round(ms * 0.8));
    };
    /* ---------- gnome tools (parcel 8g): a prop on the board, driven by sim.toolUse and sim.toolStep ---------- */
    const tu = sim.toolUse || null;
    const toolLevel = !!level.tool;
    const rectOf = (pos) => {
      const b = root.getBoundingClientRect();
      const r = cellAt(pos[0], pos[1]).getBoundingClientRect();
      return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2, w: r.width };
    };
    /** A prop sprite centred on (x, y), `size` px wide. `name` is ladder, pickaxe, scythe or plank. */
    const addProp = (name, x, y, size, cls, vars = {}) => {
      const p = span(`tool-prop ${cls}`);
      p.dataset.prop = name;
      p.setAttribute('aria-hidden', 'true');
      p.style.cssText = `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;`;
      for (const [k, v] of Object.entries(vars)) p.style.setProperty(k, v);
      root.appendChild(p);
      return p;
    };
    const dropProp = (p, ms) => setTimeout(() => p.remove(), ms);
    let plankProp = null;
    let ladderProp = null;
    /** Ladder and pickaxe: the prep move. He stays put and gets the tool out. */
    const prepTool = async (ms) => {
      const from = tu.from;
      const to = tu.to;
      setGnome(robot, face(from, to), 'idle');
      const a = rectOf(from);
      if (tu.tool === 'ladder') {
        const q = rectOf(to);
        const dx = Math.sign(q.x - a.x);
        const dy = Math.sign(q.y - a.y);
        // Props the ladder on the fence between the two tiles, leaning on it from his side.
        const p = addProp('ladder', (a.x + q.x) / 2 - dx * a.w * 0.16, (a.y + q.y) / 2 - dy * a.w * 0.16 - a.w * 0.08, a.w * 1.1, 'set', { '--lean': `${dx * 14}deg`, '--set-ms': `${ms}ms` });
        ladderProp = p;
        await sleep(ms);
      } else {
        const q = rectOf(tu.tile);
        const bush = level.tiles[tu.tile[1]][tu.tile[0]] === '#' && cellAt(tu.tile[0], tu.tile[1]).dataset.v === '2';
        const swingMs = Math.round(ms * 0.55);
        const p = addProp(bush ? 'scythe' : 'pickaxe', a.x + (q.x - a.x) * 0.5, a.y + (q.y - a.y) * 0.5 - a.w * 0.1, a.w * 0.9, 'swing', { '--swing-ms': `${swingMs}ms` });
        const rockCell = cellAt(tu.tile[0], tu.tile[1]);
        [[-1, -1], [1, -1.4], [0.2, 1]].forEach(([cx, cy], k) => {
          const chip = span('tool-chip');
          chip.setAttribute('aria-hidden', 'true');
          chip.style.cssText = `--dx:${Math.round(cx * a.w * 0.45)}px;--dy:${Math.round(cy * a.w * 0.4)}px;animation-delay:${Math.round(swingMs * (k + 0.55))}ms;`;
          rockCell.appendChild(chip);
          setTimeout(() => chip.remove(), swingMs * 3 + 500);
        });
        await sleep(swingMs * 3);
        if (cancelled()) return;
        rockCell.classList.add('crumble');
        await sleep(Math.round(ms * 0.8));
        rockCell.classList.remove('crumble');
        rockCell.classList.add('dug'); // pebbles from here on
        p.remove();
      }
    };
    /** Plank: it drops across the river tile before he steps on. */
    const layPlank = async (ms) => {
      const q = rectOf(tu.tile);
      const horizontal = tu.from[1] === tu.to[1];
      plankProp = addProp('plank', q.x, q.y, q.w * 0.95, 'lay', { '--rot': horizontal ? '0deg' : '90deg', '--lay-ms': `${Math.round(ms * 0.9)}ms` });
      await sleep(Math.round(ms * 0.9));
    };
    await sleep(250);
    for (let i = 1; i <= last; i++) {
      if (cancelled()) return false;
      mark(sim.steps[i - 1]);
      if (onMove) onMove(i);
      const via = sim.via[i];
      const trail = sim.trails ? sim.trails[i] : null; // rules v5 only; v4 replays take the branches below as before
      const stuckMove = !!sim.stuck && sim.stuck.includes(i);
      const dest = trail && trail.length ? trail[trail.length - 1] : null;
      const sliding = !!dest && !stuckMove && (trail.length > 1 || tileAt(dest) === '*');
      if (sim.trails && !stuckMove) leaveMud(stepMs); // pulls free of the mud he was stuck in (not on the stuck move itself)
      if (dest && !stuckMove && isGateAt(dest)) openGate(dest); // swings open as he comes
      const isPrep = !!tu && tu.prep === i;
      const isCross = !!tu && sim.toolStep === i;
      if (isPrep) {
        await prepTool(Math.round(stepMs * (tu.tool === 'ladder' ? 1.1 : 0.7)));
      } else if (toolLevel && !tu && sim.trails && trail && trail.length === 0 && !stuckMove) {
        await sleep(stepMs); // a tool move he did not finish (his moves ran out): he just stands there
      } else if (stuckMove) {
        await struggle(sim.steps[i], stepMs);
      } else if (sliding) {
        await glide(sim.steps[i - 1], trail, stepMs);
        if (cancelled()) return false;
        if (via) { mark(via); await teleportFrom(i, via, stepMs); }
        else if (tileAt(dest) === '&') sinkIn();
      } else if (via) {
        // Step onto the stump, hop on and sink in, then pop out of its twin.
        setGnome(robot, face(sim.steps[i - 1], via), 'walk');
        moveRobot(via, { ms: stepMs * 0.45 });
        await sleep(stepMs * 0.45);
        if (cancelled()) return false;
        mark(via);
        await teleportFrom(i, via, stepMs);
      } else if (isCross && tu.tool === 'plank') {
        await layPlank(stepMs);
        if (cancelled()) return false;
        setGnome(robot, face(sim.steps[i - 1], sim.steps[i]), 'walk');
        moveRobot(sim.steps[i], { ms: stepMs * 0.75 });
        await sleep(stepMs);
      } else if (isCross && tu.tool === 'ladder') {
        // Up and over the fence on the ladder, which then tips over and fades.
        setGnome(robot, face(sim.steps[i - 1], sim.steps[i]), 'walk');
        robot.style.setProperty('--hop-ms', `${Math.round(stepMs * 1.2)}ms`);
        robot.classList.add('hop');
        moveRobot(sim.steps[i], { ms: stepMs * 1.1 });
        await sleep(Math.round(stepMs * 1.25));
        robot.classList.remove('hop');
        if (ladderProp) { ladderProp.classList.remove('set'); ladderProp.classList.add('tip'); dropProp(ladderProp, 600); ladderProp = null; }
      } else {
        setGnome(robot, face(sim.steps[i - 1], sim.steps[i]), 'walk');
        moveRobot(sim.steps[i], { ms: stepMs * 0.75 });
        await sleep(stepMs);
        if (sim.trails && tileAt(sim.steps[i]) === '&') sinkIn();
      }
      if (plankProp && tu && sim.toolStep != null && i === sim.toolStep + 1) { // he is off the river: the plank floats away
        plankProp.classList.remove('lay');
        plankProp.classList.add('float');
        dropProp(plankProp, 800);
        plankProp = null;
      }
      if (cancelled()) return false;
      if (sim.trails) shutGates(sim.steps[i]);
    }
    if (cancelled()) return false;
    if (plankProp) { plankProp.classList.remove('lay'); plankProp.classList.add('float'); dropProp(plankProp, 800); plankProp = null; } // his moves ran out on the plank
    mark(sim.steps[last]);
    if (sim.result === 'lose') setGnome(robot, lastDir, 'idle');
    verdict();
    await sleep(sim.result === 'lose' ? 500 : 450);
    return !cancelled();
  }

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
