// Play page: level select, the game screen, and the glue between taps and the engine.
import { parseLevel, simulate, cutsAllRoutes, wouldBreakCap, stars as scoreStars } from '../../../src/game/index.js';
import { createBoard } from './board.js';
import { loadProgress, recordWin, loadHints, hintCount, spendHint } from './storage.js';
import { renderSelect, renderLab } from './select.js';
import { capMessage } from './lines.js';
import { starsMarkup } from './icons.js';
import { preloadSprites, sprite, GNOME_SPRITES, WALL_SPRITES } from '../sprites.js';
import { mountVillain, VILLAIN_SPRITES } from '../villain.js';

const EASY_URL = '../assets/levels/easy.json';
const MEDIUM_URL = '../assets/levels/medium.json';
const PACK_URL = '../assets/levels/pack-01.json'; // its 9x9 levels (11 to 30) stay as levels 41 to 55 until Hard ships; its 7x7 retired with Medium
const LAB_URL = '../assets/levels/lab.json';
const LAB_V5_URL = '../assets/levels/lab-v5.json'; // rules v5: ice, mud, gates. Listed after the five v4 lab levels (?lab=6 and up)
const LAB_V4_COUNT = 5;
const STEP_MS = 220;

const $ = (id) => document.getElementById(id);
const titleEl = $('title');
const backEl = $('back');
const selectView = $('select-view');
const gameView = $('game-view');
const boardEl = $('board');
const wallsUsedEl = $('walls-used');
const parEl = $('par');
const limitEl = $('move-limit');
const movesLeftEl = $('moves-left');
const statusEl = $('status');
const introEl = $('intro-note');
// One plain-words line on the level that introduces a tile (Medium 21, 26, 31)
const INTRO_NOTES = {
  'medium-01': 'Ice: he slides until something stops him. The whole slide is one move.',
  'medium-06': 'Mud: stepping onto it costs him 2 moves.',
  'medium-11': 'Gate: he can only pass it the way its arrow points.',
};
const toolBadgeEl = $('tool-badge');
const toolIconEl = $('tool-icon');
const toolLineEl = $('tool-line');
// Gnome tools (rules v5, parcel 8g): what he brought, shown before anything is placed.
const TOOL_TEXT = {
  ladder: ['ladder', 'He brought a ladder: he can climb one of your fences, once.'],
  pickaxe: ['pickaxe', 'He brought a pickaxe: he can dig through one rock or berry bush, once.'],
  plank: ['plank', 'He brought a plank: he can cross one river tile, once.'],
};
const controlsEl = $('controls');
const goBtn = $('go');
const clearBtn = $('clear');
const hintBtn = $('hint-btn');
const hintPanel = $('hint-panel');
const resultEl = $('result');

let levels = [];
let labLevels = []; // lab pack (rules v4) then the rules v5 lab levels, parsed
let labFailed = false;
let game = null; // { kind: 'level' | 'lab', index, level, board, state: 'editing' | 'running' | 'result', token }

let villain = null; // Sir Croakwell under the board: { setMood, cast }, or null if his sprites did not load
const mood = (m) => villain?.setMood(m);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ---------- routing ---------- */

/**
 * What the URL asks for: the select screen, a pack level, or the lab. (The old in-page daily is gone: play/index.html
 * sends `?daily` to the daily page before this runs, v3.4.)
 */
function routeFromUrl() {
  const q = new URLSearchParams(location.search);
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
const toLab = () => navigate('./?lab');
const toLabLevel = (i) => navigate(`./?lab=${i + 1}`);
const toMode = (m) => (m === 'lab' ? toLab() : toSelect());

async function render() {
  stopGame();
  const r = routeFromUrl();
  if (r.type === 'select') showSelect();
  else if (r.type === 'level') startGame({ kind: 'level', index: r.index, level: levels[r.index], title: `Level ${r.index + 1}` });
  else if (r.type === 'lab') showLab();
  else if (r.type === 'lab-level') startGame({ kind: 'lab', index: r.index, level: labLevels[r.index], title: `Lab ${r.index + 1}` });
}

/* ---------- level select ---------- */

function showSelect() {
  titleEl.textContent = 'Choose a level';
  backEl.hidden = true;
  gameView.hidden = true;
  selectView.hidden = false;
  document.title = 'Play · Gnome Sweet Gnome';
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
  document.title = 'Lab · Gnome Sweet Gnome';
  renderLab(selectView, labLevels, { onPick: toLabLevel, onMode: toMode, failed: labFailed, v4Count: LAB_V4_COUNT });
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
  document.title = `${title} · Gnome Sweet Gnome`;
  backEl.hidden = false;
  backEl.href = kind === 'lab' ? './?lab' : './';
  backEl.textContent = kind === 'lab' ? 'All lab levels' : 'All levels';
  selectView.hidden = true;
  gameView.hidden = false;

  game.board = createBoard(boardEl, level, { onLine, onHelp });
  game.board.fit();
  mood('idle');
  parEl.textContent = String(level.par);
  limitEl.textContent = String(level.moveLimit);
  movesLeftEl.textContent = String(level.moveLimit);
  const tool = TOOL_TEXT[level.tool];
  toolBadgeEl.hidden = !tool;
  if (tool) {
    toolIconEl.dataset.tool = level.tool;
    toolLineEl.textContent = tool[1];
    toolBadgeEl.setAttribute('aria-label', `Gnome's tool: ${tool[0]}`);
  } else {
    toolLineEl.textContent = '';
    toolBadgeEl.removeAttribute('aria-label');
  }
  resultEl.hidden = true;
  resultEl.innerHTML = '';
  controlsEl.hidden = false;
  goBtn.disabled = false;
  hintPanel.hidden = true;
  introEl.textContent = INTRO_NOTES[level.id] || '';
  introEl.hidden = !introEl.textContent;
  setStatus("Tap a line between two tiles to place a fence. Make the gnome's route longer than his move limit. You must leave him a way through.");
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
    mood('idle');
    setStatus('Wall removed.');
  } else if (board.wallList().length >= level.wallBudget) {
    board.refuse(target);
    wallsUsedEl.parentElement.classList.remove('refused');
    void wallsUsedEl.offsetWidth;
    wallsUsedEl.parentElement.classList.add('refused');
    refused(`All ${plural(level.wallBudget, 'wall')} placed. Tap a wall to take it back.`);
  } else if (wouldBreakCap(level, board.wallList(), line)) {
    // Rules v4: at most two sides of the gnome, and of his house, in one wall set.
    board.refuse(target);
    refused(capMessage(wouldBreakCap(level, board.wallList(), line)));
  } else if (cutsAllRoutes(level, [...board.wallList(), line])) {
    // The robot must always keep a way to the beacon (a rule of every level): refuse the wall, counters unchanged.
    board.refuse(target);
    // On a tool level, say the tool doesn't count (QA 8g F1): the no-cut rule ignores it (GAME_SPEC v5).
    refused(level.tool ? `The gnome needs at least one way through without his ${level.tool}.` : 'The gnome needs at least one way through.');
  } else {
    board.setWall(line, true, { magic: true });
    mood('idle');
    villain?.cast();
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
  setStatus('The gnome is on the move.');

  const done = await g.board.play(sim, {
    stepMs: STEP_MS, // reduced motion still steps tile by tile; the CSS drops the glide and flourishes
    cancelled,
    onMove: (i) => { movesLeftEl.textContent = String(g.level.moveLimit - i); },
  });
  if (!done || cancelled()) return;
  finish(sim, walls);
}

/** The result panel's top row: a picture (the gnome or the house) beside the heading and one more element. */
function resultHead(picture, heading, extra) {
  const row = document.createElement('div');
  row.className = 'result-head';
  const pic = picture.classList.contains('picture') ? picture : document.createElement('div');
  if (pic !== picture) { pic.className = 'picture'; pic.appendChild(picture); }
  const titles = document.createElement('div');
  titles.className = 'titles';
  titles.append(heading, extra);
  row.append(pic, titles);
  return row;
}

function finish(sim, walls) {
  const g = game;
  g.state = 'result';
  controlsEl.hidden = true;
  setStatus('');
  resultEl.hidden = false;
  resultEl.dataset.result = sim.result;
  resultEl.innerHTML = '';
  mood(sim.result === 'win' ? 'gloat' : 'sulk'); // the walk is over: trapped, he gloats; home, he sulks

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
    heading.textContent = 'Fenced in!';
    const starsEl = document.createElement('div');
    starsEl.className = 'result-stars';
    starsEl.setAttribute('role', 'img');
    starsEl.setAttribute('aria-label', `${earned} of 3 stars`);
    starsEl.dataset.stars = String(earned);
    starsEl.innerHTML = starsMarkup(earned);
    text.textContent = `Out of moves. The route is longer than the ${g.level.moveLimit} moves he has.`;
    const par = document.createElement('p');
    par.className = 'par';
    const parStrong = document.createElement('strong');
    parStrong.textContent = `Par ${g.level.par}`;
    par.append(parStrong, ` You used ${plural(walls.length, 'wall')}.`);
    resultEl.append(resultHead(sprite('gnome-down-shrug', 'gnome-sprite'), heading, starsEl), text, par);
    if (hintsUsed > 0) {
      const hp = document.createElement('p');
      hp.className = 'hint-used';
      hp.id = 'hint-used';
      hp.textContent = `${plural(hintsUsed, 'hint')} used, \u2212${plural(hintsUsed, 'star')}.`;
      resultEl.appendChild(hp);
    }
    resultEl.appendChild(actions);
    const lastLevel = g.kind === 'level' && g.index === levels.length - 1;
    // The last level of its group: the v4 lab levels and the v5 ones each end on "All lab levels"
    const next = labLevels[g.index + 1];
    const lastLab = g.kind === 'lab' && (!next || g.index === LAB_V4_COUNT - 1 || !!next.tool !== !!labLevels[g.index].tool);
    if (g.kind === 'lab') focusTarget = lastLab ? button('All lab levels', true, toLab) : button('Next level', true, () => toLabLevel(g.index + 1));
    else if (lastLevel) focusTarget = button('All levels', true, toSelect);
    else focusTarget = button('Next level', true, () => toLevel(g.index + 1));
    button('Replay', false, () => replay());
  } else {
    heading.textContent = 'He made it home';
    text.textContent = `He reached the house in ${plural(sim.movesUsed, 'move')}. Try a different fence line.`;
    const house = document.createElement('div');
    house.className = 'picture house';
    house.setAttribute('aria-hidden', 'true');
    resultEl.append(resultHead(house, heading, text), actions);
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
  mood('idle');
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
  mood('idle');
  updateCounters();
  const kept = game.board.hintLines().length;
  setStatus(kept ? 'Your walls are cleared. Hint walls stay.' : 'Walls cleared.');
});

/* ---------- hints ---------- */

/**
 * Why `line` can't be placed right now on top of the board's walls, or null if it can. The
 * order matches a tap: budget, the side cap, then the no-cut rule.
 */
function whyNot(line) {
  const { board, level } = game;
  const walls = board.wallList();
  if (walls.length >= level.wallBudget) return `All ${plural(level.wallBudget, 'wall')} are placed, so there is no room for a hint wall. Take one of your walls back first.`;
  const cap = wouldBreakCap(level, walls, line);
  if (cap) return `${capMessage(cap)} Take a wall back to make room for the hint.`;
  if (cutsAllRoutes(level, [...walls, line])) return 'Your walls leave no room for that hint: it would cut off the gnome completely. Take a wall back and try again.';
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
  board.setWall(line, true, { hint: true, magic: true });
  mood('idle');
  villain?.cast();
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
  // Start the art (Sir Croakwell's too) now, so it loads beside the level files, not after them.
  const art = preloadSprites([...GNOME_SPRITES, ...WALL_SPRITES, ...VILLAIN_SPRITES]);
  art.catch(() => {}); // handled where it is awaited below
  try {
    const [easyRes, mediumRes, packRes] = await Promise.all([fetch(EASY_URL), fetch(MEDIUM_URL), fetch(PACK_URL)]);
    if (!easyRes.ok || !mediumRes.ok || !packRes.ok) throw new Error(`${easyRes.status} ${mediumRes.status} ${packRes.status}`);
    const [easy, medium, pack] = await Promise.all([easyRes.json(), mediumRes.json(), packRes.json()]);
    // Easy 1 to 20, Medium 21 to 40, then pack 1's 9x9 levels as 41 to 55 (its 5x5 is Easy 1 to 5; its 7x7 retired)
    levels = [...easy.levels, ...medium.levels, ...pack.levels.filter((l) => l.size === 9)].map((l) => parseLevel(l));
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
  if (!labFailed) {
    try {
      const res = await fetch(LAB_V5_URL);
      if (!res.ok) throw new Error(`${res.status}`);
      labLevels = [...labLevels, ...(await res.json()).levels.map((l) => parseLevel(l))];
    } catch { /* the new-tiles levels are optional: the five v4 lab levels still show */ }
  }
  try {
    await art;
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
  try {
    villain = await mountVillain($('villain'));
  } catch {
    villain = null; // he is decoration: the game plays without him
  }
  loading.hidden = true;
  loadProgress();
  loadHints();
  render();
}

boot();
