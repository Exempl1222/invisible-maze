// Play page: level select, the game screen, and the glue between taps and the engine.
import { parseLevel, simulate, stars as scoreStars } from '../../../src/game/index.js';
import { createBoard } from './board.js';
import { loadProgress, recordWin } from './storage.js';
import { renderSelect } from './select.js';
import { starsMarkup } from './icons.js';

const PACK_URL = '../assets/levels/pack-01.json';
const STEP_MS = 300;

const $ = (id) => document.getElementById(id);
const titleEl = $('title');
const backEl = $('back');
const selectView = $('select-view');
const gameView = $('game-view');
const boardEl = $('board');
const wallsUsedEl = $('walls-used');
const limitEl = $('move-limit');
const movesLeftEl = $('moves-left');
const statusEl = $('status');
const controlsEl = $('controls');
const goBtn = $('go');
const clearBtn = $('clear');
const resultEl = $('result');

let levels = [];
let game = null; // { index, level, board, state: 'editing' | 'running' | 'result', token }

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ---------- routing ---------- */

function levelFromUrl() {
  const n = Number(new URLSearchParams(location.search).get('level'));
  return Number.isInteger(n) && n >= 1 && n <= levels.length ? n - 1 : null;
}

function navigate(index, { push = true } = {}) {
  if (push) history.pushState({}, '', index === null ? './' : `./?level=${index + 1}`);
  show(index);
  window.scrollTo(0, 0);
}

function show(index) {
  stopGame();
  if (index === null) showSelect();
  else startGame(index);
}

/* ---------- level select ---------- */

function showSelect() {
  titleEl.textContent = 'Choose a level';
  backEl.hidden = true;
  gameView.hidden = true;
  selectView.hidden = false;
  document.title = 'Play · Invisible Maze';
  renderSelect(selectView, levels, (i) => navigate(i));
}

/* ---------- game ---------- */

function setStatus(text) {
  statusEl.textContent = text;
}

function updateCounters() {
  const used = game.board.wallList().length;
  wallsUsedEl.textContent = `${used} / ${game.level.wallBudget}`;
  clearBtn.disabled = used === 0 || game.state !== 'editing';
}

function startGame(index) {
  const level = levels[index];
  game = { index, level, state: 'editing', token: 0, board: null };
  titleEl.textContent = `Level ${index + 1}`;
  document.title = `Level ${index + 1} · Invisible Maze`;
  backEl.hidden = false;
  selectView.hidden = true;
  gameView.hidden = false;

  game.board = createBoard(boardEl, level, { onTap });
  limitEl.textContent = String(level.moveLimit);
  movesLeftEl.textContent = String(level.moveLimit);
  resultEl.hidden = true;
  resultEl.innerHTML = '';
  controlsEl.hidden = false;
  goBtn.disabled = false;
  setStatus('Tap grass to place walls. Block the route, or make it too long.');
  updateCounters();
}

function stopGame() {
  if (!game) return;
  game.token++; // cancels any animation in flight
  game.board.destroy();
  game = null;
}

function onTap(x, y, cell) {
  if (!game || game.state !== 'editing') return;
  const { board, level } = game;
  if (!level.buildable(x, y)) {
    board.nope(x, y);
    return;
  }
  if (board.hasWall(x, y)) {
    board.setWall(x, y, false);
    setStatus('Wall removed.');
  } else if (board.wallList().length >= level.wallBudget) {
    board.nope(x, y);
    wallsUsedEl.parentElement.classList.remove('refused');
    void wallsUsedEl.offsetWidth;
    wallsUsedEl.parentElement.classList.add('refused');
    setStatus(`All ${plural(level.wallBudget, 'wall')} placed. Tap a wall to take it back.`);
  } else {
    board.setWall(x, y, true);
    setStatus(board.wallList().length === level.wallBudget
      ? 'All walls placed. Press Go.'
      : 'Wall placed.');
  }
  updateCounters();
}

async function run() {
  if (!game || game.state !== 'editing') return;
  const g = game;
  const walls = g.board.wallList();
  const sim = simulate(g.level, walls);
  g.state = 'running';
  g.token++;
  const token = g.token;
  const cancelled = () => game !== g || g.token !== token;

  resultEl.hidden = true;
  controlsEl.hidden = false;
  goBtn.disabled = true;
  clearBtn.disabled = true;
  g.board.setLocked(true);
  movesLeftEl.textContent = String(g.level.moveLimit);
  setStatus('The robot is moving.');

  const done = await g.board.play(sim, {
    stepMs: STEP_MS,
    instant: reducedMotion(),
    cancelled,
    onMove: (i) => { movesLeftEl.textContent = String(g.level.moveLimit - i); },
  });
  if (!done || cancelled()) return;
  finish(sim, walls);
}

function finish(sim, walls) {
  const g = game;
  g.state = 'result';
  controlsEl.hidden = true;
  setStatus('');
  resultEl.hidden = false;
  resultEl.dataset.result = sim.result;
  resultEl.innerHTML = '';

  const heading = document.createElement('h2');
  const text = document.createElement('p');
  text.className = 'result-text';
  const actions = document.createElement('div');
  actions.className = 'result-actions';
  const button = (label, primary, handler) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = primary ? 'btn' : 'btn quiet';
    b.textContent = label;
    b.addEventListener('click', handler);
    actions.appendChild(b);
    return b;
  };

  let focusTarget;
  if (sim.result === 'win') {
    const earned = scoreStars(g.level.par, walls.length, g.level.wallBudget);
    recordWin(g.level.id, earned);
    heading.textContent = 'Robot stopped';
    const starsEl = document.createElement('div');
    starsEl.className = 'result-stars';
    starsEl.setAttribute('role', 'img');
    starsEl.setAttribute('aria-label', `${earned} of 3 stars`);
    starsEl.dataset.stars = String(earned);
    starsEl.innerHTML = starsMarkup(earned);
    text.textContent = sim.reason === 'blocked'
      ? 'No route left. The robot cannot reach the beacon.'
      : `Out of moves. The route is longer than the ${g.level.moveLimit} moves it has.`;
    const par = document.createElement('p');
    par.className = 'par';
    const parStrong = document.createElement('strong');
    parStrong.textContent = `Par ${g.level.par}`;
    par.append(parStrong, ` You used ${plural(walls.length, 'wall')}.`);
    resultEl.append(heading, starsEl, text, par, actions);
    const last = g.index === levels.length - 1;
    if (last) focusTarget = button('All levels', true, () => navigate(null));
    else focusTarget = button('Next level', true, () => navigate(g.index + 1));
    button('Replay', false, () => replay());
  } else {
    heading.textContent = 'The robot got through';
    text.textContent = `The robot reached the beacon in ${plural(sim.movesUsed, 'move')}.`;
    resultEl.append(heading, text, actions);
    focusTarget = button('Try again', true, () => retry());
  }
  focusTarget.focus({ preventScroll: true });
  resultEl.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/** Back to placing walls. Keeps the walls. */
function retry() {
  const g = game;
  g.state = 'editing';
  g.token++;
  g.board.resetRun();
  g.board.setLocked(false);
  movesLeftEl.textContent = String(g.level.moveLimit);
  resultEl.hidden = true;
  controlsEl.hidden = false;
  goBtn.disabled = false;
  setStatus('Move or remove walls, then press Go.');
  updateCounters();
  goBtn.focus({ preventScroll: true });
}

/** Start the level over on a clean board, to chase more stars. */
function replay() {
  game.board.clearWalls();
  retry();
  setStatus('Fresh board. Tap grass to place walls.');
}

goBtn.addEventListener('click', run);
clearBtn.addEventListener('click', () => {
  if (!game || game.state !== 'editing') return;
  game.board.clearWalls();
  updateCounters();
  setStatus('Walls cleared.');
});
backEl.addEventListener('click', (e) => {
  e.preventDefault();
  navigate(null);
});
window.addEventListener('popstate', () => show(levelFromUrl()));

/* ---------- boot ---------- */

async function boot() {
  const loading = $('loading');
  try {
    const res = await fetch(PACK_URL);
    if (!res.ok) throw new Error(`${res.status}`);
    const pack = await res.json();
    levels = pack.levels.map((l) => parseLevel(l));
  } catch (err) {
    loading.textContent = '';
    const p = document.createElement('p');
    p.textContent = 'The levels did not load. Check your connection and try again.';
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn';
    retryBtn.textContent = 'Reload';
    retryBtn.addEventListener('click', () => location.reload());
    loading.append(p, retryBtn);
    return;
  }
  loading.hidden = true;
  loadProgress();
  show(levelFromUrl());
}

boot();
