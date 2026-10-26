// Play page: level select, the game screen, and the glue between taps and the engine.
import { parseLevel, simulate, cutsAllRoutes, wouldBreakCap, stars as scoreStars } from '../../../src/game/index.js';
import { createBoard } from './board.js';
import { loadProgress, recordWin, loadHints, hintCount, spendHint, earnDailyHint } from './storage.js';
import { renderSelect, renderLab } from './select.js';
import { capMessage } from './lines.js';
import { starsMarkup } from './icons.js';
import { preloadSprites } from '../sprites.js';
import { localDateString, parseDate, dayIndex, formatDaily } from './daily.js';

const PACK_URL = '../assets/levels/pack-01.json';
const DAILY_URL = '../assets/levels/daily.json';
const LAB_URL = '../assets/levels/lab.json';
const STEP_MS = 220;

const $ = (id) => document.getElementById(id);
const titleEl = $('title');
const backEl = $('back');
const selectView = $('select-view');
const gameView = $('game-view');
const boardEl = $('board');
const breakEl = $('daily-break');
const wallsUsedEl = $('walls-used');
const parEl = $('par');
const limitEl = $('move-limit');
const movesLeftEl = $('moves-left');
const statusEl = $('status');
const controlsEl = $('controls');
const goBtn = $('go');
const clearBtn = $('clear');
const hintBtn = $('hint-btn');
const hintPanel = $('hint-panel');
const resultEl = $('result');

let levels = [];
let labLevels = []; // lab pack (rules v4), parsed
let labFailed = false;
let daily = null; // { start, levels } once daily.json has loaded
let game = null; // { kind: 'level' | 'daily', index, level, board, state: 'editing' | 'running' | 'result', token }

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ---------- routing ---------- */

/** What the URL asks for: the select screen, a pack level, or the daily (optionally for a given date). */
function routeFromUrl() {
  const q = new URLSearchParams(location.search);
  if (q.has('daily')) {
    const asked = q.get('date');
    return { type: 'daily', date: parseDate(asked) !== null ? asked : localDateString() };
  }
  if (q.has('lab')) {
    const k = Number(q.get('lab'));
    if (Number.isInteger(k) && k >= 1 && k <= labLevels.length) return { type: 'lab-level', index: k - 1 };
    return { type: 'lab' };
  }
  const n = Number(q.get('level'));
  if (Number.isInteger(n) && n >= 1 && n <= levels.length) return { type: 'level', index: n - 1 };
  return { type: 'select' };
}

function navigate(url, { push = true } = {}) {
  if (push) history.pushState({}, '', url);
  render();
  window.scrollTo(0, 0);
}
const toSelect = () => navigate('./');
const toLevel = (i) => navigate(`./?level=${i + 1}`);
const toDaily = () => navigate('./?daily');
const toLab = () => navigate('./?lab');
const toLabLevel = (i) => navigate(`./?lab=${i + 1}`);
const toMode = (m) => (m === 'daily' ? toDaily() : m === 'lab' ? toLab() : toSelect());

async function render() {
  stopGame();
  breakEl.hidden = true;
  const r = routeFromUrl();
  if (r.type === 'select') showSelect();
  else if (r.type === 'level') startGame({ kind: 'level', index: r.index, level: levels[r.index], title: `Level ${r.index + 1}` });
  else if (r.type === 'lab') showLab();
  else if (r.type === 'lab-level') startGame({ kind: 'lab', index: r.index, level: labLevels[r.index], title: `Lab ${r.index + 1}` });
  else await showDaily(r.date);
}

/* ---------- level select ---------- */

function showSelect() {
  titleEl.textContent = 'Choose a level';
  backEl.hidden = true;
  gameView.hidden = true;
  selectView.hidden = false;
  document.title = 'Play · Invisible Maze';
  renderSelect(selectView, levels, {
    onPick: toLevel,
    onMode: toMode,
  });
}

function showLab() {
  titleEl.textContent = 'Lab';
  backEl.hidden = true;
  gameView.hidden = true;
  selectView.hidden = false;
  document.title = 'Lab · Invisible Maze';
  renderLab(selectView, labLevels, { onPick: toLabLevel, onMode: toMode, failed: labFailed });
}

/* ---------- daily ---------- */

async function loadDaily() {
  if (daily) return daily;
  const res = await fetch(DAILY_URL);
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  daily = { start: data.start, levels: data.levels };
  return daily;
}

async function showDaily(date) {
  const pretty = formatDaily(date);
  titleEl.textContent = 'Daily';
  backEl.hidden = false;
  selectView.hidden = true;
  gameView.hidden = true;
  let data;
  try {
    data = await loadDaily();
  } catch {
    showBreak('The daily did not load. Check your connection and try again.');
    return;
  }
  if (routeFromUrl().type !== 'daily') return; // the player already moved on
  const i = dayIndex(data.start, date);
  if (i === null || i < 0 || i >= data.levels.length) {
    showBreak();
    return;
  }
  const level = parseLevel(data.levels[i]);
  startGame({ kind: 'daily', index: i, level, title: `Daily, ${pretty}` });
}

function showBreak(message) {
  titleEl.textContent = 'Daily';
  document.title = 'Daily · Invisible Maze';
  gameView.hidden = true;
  selectView.hidden = true;
  breakEl.querySelector('strong').textContent = message || 'The daily is taking a break.';
  breakEl.hidden = false;
}

/* ---------- game ---------- */

function setStatus(text) {
  statusEl.textContent = text;
}

function updateCounters() {
  const used = game.board.wallList().length;
  wallsUsedEl.textContent = `${used} / ${game.level.wallBudget}`;
  const mine = used - game.board.hintLines().length; // Clear walls only removes the player's own walls
  clearBtn.disabled = mine === 0 || game.state !== 'editing';
  hintBtn.disabled = game.state !== 'editing';
  hintBtn.textContent = `Hint (${hintCount()})`;
}

function startGame({ kind, index, level, title }) {
  game = { kind, index, level, state: 'editing', token: 0, board: null };
  titleEl.textContent = title;
  document.title = `${title} · Invisible Maze`;
  backEl.hidden = false;
  backEl.href = kind === 'lab' ? './?lab' : './';
  backEl.textContent = kind === 'lab' ? 'All lab levels' : 'All levels';
  selectView.hidden = true;
  gameView.hidden = false;

  game.board = createBoard(boardEl, level, { onLine, onHelp });
  game.board.fit();
  parEl.textContent = String(level.par);
  limitEl.textContent = String(level.moveLimit);
  movesLeftEl.textContent = String(level.moveLimit);
  resultEl.hidden = true;
  resultEl.innerHTML = '';
  controlsEl.hidden = false;
  goBtn.disabled = false;
  hintPanel.hidden = true;
  setStatus(kind === 'lab'
    ? 'Lab rules: you can wall next to bridges and teleporters, and up to two sides of the robot and beacon. Leave the robot a way through.'
    : "Tap a line between two tiles to place a wall. Make the robot's route longer than its move limit. You must leave it a way through.");
  updateCounters();
}

function stopGame() {
  if (!game) return;
  game.token++; // cancels any animation in flight
  game.board.destroy();
  game = null;
}

function onHelp() {
  setStatus('Press Shift and an arrow key to place or remove a wall on that side of this tile.');
}

/** A press that can't place a wall: say why, loudly. */
function refused(text) {
  setStatus(text);
  statusEl.classList.remove('refused');
  void statusEl.offsetWidth;
  statusEl.classList.add('refused');
}

function onLine(target) {
  if (!game || game.state !== 'editing') return;
  const { board, level } = game;
  statusEl.classList.remove('refused');
  if (!target.ok) {
    board.refuse(target);
    refused(target.why);
    return;
  }
  const line = target.line;
  if (board.isHintWall(line)) {
    board.refuse(target);
    refused('That wall is a hint, so it stays. Hints cannot be taken back.');
  } else if (board.hasWall(line)) {
    board.setWall(line, false);
    setStatus('Wall removed.');
  } else if (board.wallList().length >= level.wallBudget) {
    board.refuse(target);
    wallsUsedEl.parentElement.classList.remove('refused');
    void wallsUsedEl.offsetWidth;
    wallsUsedEl.parentElement.classList.add('refused');
    refused(`All ${plural(level.wallBudget, 'wall')} placed. Tap a wall to take it back.`);
  } else if (wouldBreakCap(level, board.wallList(), line)) {
    // Lab rules v4: at most two sides of the robot, and of the beacon, in one wall set.
    board.refuse(target);
    refused(capMessage(wouldBreakCap(level, board.wallList(), line)));
  } else if (cutsAllRoutes(level, [...board.wallList(), line])) {
    // The robot must always keep a way to the beacon (rules v3.1): refuse the wall, counters unchanged.
    board.refuse(target);
    refused('The robot needs at least one way through.');
  } else {
    board.setWall(line, true);
    const used = board.wallList().length;
    setStatus(used === level.wallBudget ? 'All walls placed. Press Go.' : `Wall placed. ${used} of ${level.wallBudget} used.`);
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
    const hintsUsed = g.board.hintLines().length;
    const earned = scoreStars(g.level.par, walls.length, g.level.wallBudget, hintsUsed);
    recordWin(g.level.id, earned); // keeps the highest ever earned
    const gotHint = g.kind === 'daily' && earnDailyHint(g.level.id.slice(2));
    heading.textContent = 'Robot stopped';
    const starsEl = document.createElement('div');
    starsEl.className = 'result-stars';
    starsEl.setAttribute('role', 'img');
    starsEl.setAttribute('aria-label', `${earned} of 3 stars`);
    starsEl.dataset.stars = String(earned);
    starsEl.innerHTML = starsMarkup(earned);
    text.textContent = `Out of moves. The route is longer than the ${g.level.moveLimit} moves it has.`;
    const par = document.createElement('p');
    par.className = 'par';
    const parStrong = document.createElement('strong');
    parStrong.textContent = `Par ${g.level.par}`;
    par.append(parStrong, ` You used ${plural(walls.length, 'wall')}.`);
    resultEl.append(heading, starsEl, text, par);
    if (hintsUsed > 0) {
      const hp = document.createElement('p');
      hp.className = 'hint-used';
      hp.id = 'hint-used';
      hp.textContent = `${plural(hintsUsed, 'hint')} used, \u2212${plural(hintsUsed, 'star')}.`;
      resultEl.appendChild(hp);
    }
    if (gotHint) {
      const hp = document.createElement('p');
      hp.className = 'hint-used';
      hp.id = 'hint-earned';
      hp.textContent = `Daily done: +1 hint. You have ${hintCount()}.`;
      resultEl.appendChild(hp);
    }
    resultEl.appendChild(actions);
    const lastLevel = g.kind === 'level' && g.index === levels.length - 1;
    const lastLab = g.kind === 'lab' && g.index === labLevels.length - 1;
    if (g.kind === 'daily') focusTarget = button('Back to levels', true, toSelect);
    else if (g.kind === 'lab') focusTarget = lastLab ? button('All lab levels', true, toLab) : button('Next level', true, () => toLabLevel(g.index + 1));
    else if (lastLevel) focusTarget = button('All levels', true, toSelect);
    else focusTarget = button('Next level', true, () => toLevel(g.index + 1));
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
  statusEl.classList.remove('refused');
  updateCounters();
  goBtn.focus({ preventScroll: true });
}

/** Start the level over on a clean board, to chase more stars. */
function replay() {
  game.board.clearWalls(); // hint walls stay for this attempt
  retry();
  const kept = game.board.hintLines().length;
  setStatus(kept ? 'Fresh board. Your hint walls stay for this attempt.' : 'Fresh board. Tap a line between two tiles to place a wall.');
}

goBtn.addEventListener('click', run);
clearBtn.addEventListener('click', () => {
  if (!game || game.state !== 'editing') return;
  game.board.clearWalls();
  updateCounters();
  const kept = game.board.hintLines().length;
  setStatus(kept ? 'Your walls are cleared. Hint walls stay.' : 'Walls cleared.');
});

/* ---------- hints ---------- */

/**
 * Why `line` can't be placed right now on top of the board's walls, or null if it can. The
 * order matches a tap: budget, the lab side cap, then the no-cut rule.
 */
function whyNot(line) {
  const { board, level } = game;
  const walls = board.wallList();
  if (walls.length >= level.wallBudget) return `All ${plural(level.wallBudget, 'wall')} are placed, so there is no room for a hint wall. Take one of your walls back first.`;
  const cap = wouldBreakCap(level, walls, line);
  if (cap) return `${capMessage(cap)} Take a wall back to make room for the hint.`;
  if (cutsAllRoutes(level, [...walls, line])) return 'Your walls leave no room for that hint: it would cut off the robot completely. Take a wall back and try again.';
  return null;
}

function useHint() {
  if (!game || game.state !== 'editing') return;
  statusEl.classList.remove('refused');
  if (hintCount() <= 0) {
    hintPanel.hidden = false;
    $('hint-panel-close').focus({ preventScroll: true });
    return;
  }
  hintPanel.hidden = true;
  const { board, level } = game;
  const answer = level.answer;
  if (!Array.isArray(answer) || answer.length === 0) {
    refused('This level has no hint.');
    return;
  }
  const missing = answer.filter((w) => !board.hasWall(w));
  if (missing.length === 0) {
    setStatus('Every wall of the answer is already on the board. No hint used.');
    return;
  }
  // First answer wall that can go down now; if none can, explain the first one and keep the hint.
  const line = missing.find((w) => whyNot(w) === null);
  if (!line) {
    refused(`${whyNot(missing[0])} No hint used.`);
    return;
  }
  if (!spendHint()) return;
  board.setWall(line, true, { hint: true });
  const used = board.wallList().length;
  setStatus(`Hint placed: one wall of a par answer. ${used} of ${level.wallBudget} walls used. It costs 1 star on this level.`);
  updateCounters();
}
hintBtn.addEventListener('click', useHint);
$('hint-panel-close').addEventListener('click', () => { hintPanel.hidden = true; hintBtn.focus({ preventScroll: true }); });
backEl.addEventListener('click', (e) => {
  e.preventDefault();
  if (game && game.kind === 'lab') toLab(); else toSelect();
});
window.addEventListener('popstate', () => render());

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
  try {
    const res = await fetch(LAB_URL);
    if (!res.ok) throw new Error(`${res.status}`);
    labLevels = (await res.json()).levels.map((l) => parseLevel(l));
  } catch {
    labFailed = true; // the Lab tab says so; the rest of the game still works
  }
  try {
    await preloadSprites();
  } catch {
    loading.textContent = '';
    const p = document.createElement('p');
    p.textContent = 'The game art did not load. Check your connection and try again.';
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
  loadHints();
  render();
}

boot();
