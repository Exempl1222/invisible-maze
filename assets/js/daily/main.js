// The standalone daily page: two puzzles a day (Easy 7x7 and Hard 9x9), three tries, a score out
// of 100, one hint, a share button. Reuses the engine, the board and the sprites. It does not
// import the full game's main.js or storage.
import { parseLevel, buildableLines, simulate, cutsAllRoutes, wouldBreakCap } from '../../../src/game/index.js';
import { createBoard } from '../play/board.js';
import { capMessage, lineKey } from '../play/lines.js';
import { localDateString, parseDate, dayIndex, formatDaily } from '../play/daily.js';
import { preloadSprites, sprite } from '../sprites.js';
import { APP_LINK, MAX_TRIES, MODES, MODE_LABEL, DEFAULT_MODE, LEVEL_URL } from './config.js';
import { scoreFor, shownScore, bestScore, maxScore, HINT_COST } from './score.js';
import { freshDay, parseLineKey, mergeDay } from './record.js';

import { loadStore, getDay, saveDay, allDays, seenHowTo, lastMode, setLastMode, pendingV1, adoptV1, refresh, onExternalChange } from './store.js';
import { classifyDate, archiveRows } from './archive.js';
import { shareText, pageUrl } from './share.js';
import { nextGnome, msToNextMinute } from './countdown.js';
import { setupHowTo, setupStats, setupArchive } from './dialogs.js';

const STEP_MS = 220;

const $ = (id) => document.getElementById(id);
const titleEl = $('title');
const dateLineEl = $('date-line');
const triesEl = $('tries');
const pipsEl = $('pips');
const tabsEl = $('size-tabs');
const gameView = $('game-view');
const boardEl = $('board');
const breakEl = $('daily-break');
const fencesEl = $('fences-used');
const bestEl = $('best-score');
const limitEl = $('move-limit');
const movesLeftEl = $('moves-left');
const statusEl = $('status');
const controlsEl = $('controls');
const goBtn = $('go');
const clearBtn = $('clear');
const hintBtn = $('hint-btn');
const resultEl = $('result');
const newDayEl = $('new-day');

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The day's score as shown: the best winning try's base, less the hint when it was used. */
const dayScore = (day) => bestScore(day.tries, day.hint !== null);
const plural = (n, word) => `${n} ${n === 1 ? word : word === 'try' ? 'tries' : `${word}s`}`;

/** The date being played: today, or one of the 29 days before it (`?date=YYYY-MM-DD`, the archive). */
const realToday = localDateString();
const query = new URLSearchParams(location.search);
const route = classifyDate(query.get('date'), realToday);
const date = route.date;
const isArchive = route.kind === 'archive';

// The mode: ?mode=, else the one chosen last, else Easy. Read after the store loads (see boot).
let mode = DEFAULT_MODE;
const urlFor = (m, d) => {
  const q = new URLSearchParams({ mode: m });
  if (d) q.set('date', d);
  return `${location.pathname}?${q}`;
};
const goToday = () => { location.href = urlFor(mode, null); };

let game = null; // { level, board, number, day, state: 'editing' | 'running' | 'review' | 'done' }
let stats = null;
let clockTimer = 0;
let countdownBox = null; // { box, text } once a day is done

/* ---------- page chrome ---------- */

function setupWordmark() {
  if (!APP_LINK.enabled) return;
  const old = $('wordmark');
  const a = document.createElement('a');
  a.className = old.className;
  a.id = old.id;
  a.href = APP_LINK.href;
  a.append(...old.childNodes);
  old.replaceWith(a);
}

function setupTabs() {
  for (const m of MODES) {
    const a = $(`tab-${m}`);
    a.href = urlFor(m, isArchive ? date : null);
    if (m === mode) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  tabsEl.hidden = false;
}

function showBreak(message, more) {
  titleEl.textContent = 'Daily';
  document.title = 'Daily · Gnome Sweet Gnome';
  dateLineEl.textContent = parseDate(date) !== null ? formatDaily(date) : '';
  triesEl.hidden = true;
  gameView.hidden = true;
  $('break-text').textContent = message || 'The daily is taking a break.';
  const moreEl = $('break-more');
  moreEl.textContent = more === undefined ? 'There is no puzzle for this date yet. Check back soon.' : more;
  moreEl.hidden = !moreEl.textContent;
  $('break-today').hidden = date === realToday; // a way back to today, never to the full game
  const old = breakEl.querySelector('a');
  if (old) old.remove();
  if (APP_LINK.enabled) {
    const a = document.createElement('a');
    a.className = 'btn';
    a.href = APP_LINK.href;
    a.textContent = APP_LINK.label;
    breakEl.appendChild(a);
  }
  breakEl.hidden = false;
}

/** Filled pips are tries left; a won try is a tick; spent lost tries are empty. */
function renderPips() {
  const { tries, done } = game.day;
  [...pipsEl.children].forEach((pip, i) => {
    pip.className = i < tries.length ? (tries[i].won ? 'won' : '') : !done ? 'left' : '';
  });
  const wins = tries.filter((t) => t.won).length;
  pipsEl.setAttribute('aria-label', done ? `${plural(tries.length, 'try')} used${wins ? `, ${plural(wins, 'win')}` : ''}` : `${plural(MAX_TRIES - tries.length, 'try')} left`);
}

function setStatus(text, cls = '') {
  statusEl.textContent = text;
  statusEl.classList.remove('refused', 'note');
  if (cls) statusEl.classList.add(cls);
}

/** A press that can't place a fence: say why, loudly. */
function refused(text) {
  setStatus(text);
  void statusEl.offsetWidth;
  statusEl.classList.add('refused');
}

function updateCounters() {
  const { board, day, state } = game;
  const used = board.wallList().length;
  fencesEl.textContent = String(used);
  const best = dayScore(day);
  bestEl.textContent = best > 0 ? String(best) : '-';
  const mine = used - board.hintLines().length;
  const editing = state === 'editing';
  clearBtn.disabled = mine === 0 || !editing;
  hintBtn.disabled = !editing || day.hint !== null;
  hintBtn.textContent = day.hint !== null ? 'Hint used' : `Hint (-${HINT_COST})`;
  goBtn.disabled = !editing;
  goBtn.textContent = day.tries.length === 0 ? 'Try' : `Try again (${MAX_TRIES - day.tries.length} left)`;
  renderPips();
}

function persist() {
  game.day.walls = game.board.wallList().map(lineKey);
  saveDay(mode, date, game.day);
}

/**
 * Take in what another tab saved for this date: more tries, a used hint, a finished day. Returns
 * true if the day is finished now (and shown as such). The board's own fences are kept.
 */
function adoptStored() {
  const g = game;
  refresh();
  const stored = getDay(mode, date);
  if (!stored || g.state === 'running' || g.state === 'done') return g.state === 'done';
  const changed = stored.tries.length > g.day.tries.length || stored.done || (stored.hint !== null && g.day.hint === null);
  if (!changed) return false;
  const walls = g.day.walls;
  g.day = mergeDay(stored, g.day);
  if (g.day.done) {
    showDone({ redraw: true });
    return true;
  }
  g.day.walls = walls;
  updateCounters();
  return false;
}

// Another tab saved something: if it changed the day on screen, show it.
onExternalChange(() => {
  if (!game || game.state !== 'editing') return;
  const before = game.day.tries.length;
  if (adoptStored()) return;
  if (game.day.tries.length !== before) setStatus(`Updated from another tab. ${plural(MAX_TRIES - game.day.tries.length, 'try')} left today.`);
});

/* ---------- starting a day ---------- */

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function boot() {
  const loading = $('loading');
  const failed = (text) => {
    loading.textContent = '';
    const p = document.createElement('p');
    p.textContent = text;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = 'Reload';
    b.addEventListener('click', () => location.reload());
    loading.append(p, b);
  };
  loadStore();

  // v1 saves (one shared puzzle) become Hard records, scored against the Hard levels' pars. This runs
  // before the mode is chosen, because a migrated player opens on Hard. If Hard's levels can't be
  // fetched, migration is skipped for this load (the v1 text stays) and the page carries on.
  let hardData = null;
  const v1 = pendingV1();
  if (v1 !== null) {
    try {
      hardData = await fetchJson(LEVEL_URL.hard);
      adoptV1(v1, (d) => {
        const i = dayIndex(hardData.start, d);
        return i === null || i < 0 ? null : hardData.levels[i]?.par ?? null;
      });
    } catch {
      hardData = null;
    }
  }

  const asked = query.get('mode');
  mode = MODES.includes(asked) ? asked : MODES.includes(lastMode()) ? lastMode() : DEFAULT_MODE;
  setupWordmark();
  setupTabs();
  dateLineEl.textContent = formatDaily(date);

  let data;
  try {
    data = mode === 'hard' && hardData ? hardData : await fetchJson(LEVEL_URL[mode]);
    await preloadSprites();
  } catch {
    failed('The daily did not load. Check your connection and try again.');
    return;
  }
  setLastMode(mode);
  loading.hidden = true;

  const howto = setupHowTo();
  stats = setupStats(() => realToday, () => mode);
  setupArchive({
    getRows: () => archiveRows({ days: allDays(), today: realToday, start: data.start, count: data.levels.length }),
    onPick: (row) => { location.href = urlFor(mode, row.today ? null : row.date); },
    currentDate: date,
  });
  $('break-today').addEventListener('click', goToday);
  $('today-link').addEventListener('click', goToday);
  $('new-day-play').addEventListener('click', goToday);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) clockTick(); });

  const i = dayIndex(data.start, date);
  if (route.kind === 'future') showBreak('Not ready yet. This gnome is still packing.', '');
  else if (route.kind === 'old') showBreak('That day is out of the archive.', '');
  else if (i === null || i < 0 || i >= data.levels.length) showBreak();
  else startDay(data.levels[i], i + 1);
  clockTick();

  if (!seenHowTo()) howto.show($('help-btn'));
}

/** The level as the page plays it: no fence limit, so the engine's budget is every buildable line. */
function levelWithoutLimit(raw) {
  const n = buildableLines(parseLevel(raw)).length;
  return parseLevel({ ...raw, wallBudget: n });
}

function startDay(raw, number) {
  const level = levelWithoutLimit(raw);
  const day = getDay(mode, date) || freshDay();
  game = { level, number, day, state: 'editing', board: null };
  titleEl.textContent = `Daily #${number}`;
  if (isArchive) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = 'Archive';
    titleEl.append(' ', tag);
    $('today-link').hidden = false;
  }
  document.title = `${MODE_LABEL[mode]} #${number} · Gnome Sweet Gnome`;
  triesEl.hidden = false;
  gameView.hidden = false;

  game.board = createBoard(boardEl, level, { onLine, onHelp });
  game.board.fit();
  limitEl.textContent = String(level.moveLimit);
  movesLeftEl.textContent = String(level.moveLimit);

  if (day.done) {
    showDone();
    return;
  }
  const last = day.tries.at(-1);
  if (last && last.won && day.reviewing) {
    // Reloaded on the win screen: show that try's fences and the choice again.
    restoreWalls(last.walls ?? day.walls);
    showReview();
    return;
  }
  restoreWalls(day.walls);
  updateCounters();
  if (day.tries.length > 0) setStatus(`Welcome back. ${plural(MAX_TRIES - day.tries.length, 'try')} left today.`);
  else setStatus("Tap a line between two tiles to place a fence. Make the gnome's route longer than his move limit.");
}

/** Put fences back, the hint fence in hint style. Lines that no longer fit the level are skipped. */
function restoreWalls(keys) {
  const { board, level, day } = game;
  for (const k of keys) {
    const line = parseLineKey(k);
    if (!line) continue;
    if (line[0] < 0 || line[1] < 0 || line[0] >= level.size || line[1] >= level.size) continue;
    if (!level.lineBuildable(line[0], line[1], line[2])) continue;
    board.setWall(line, true, { hint: k === day.hint });
  }
}

/* ---------- placing fences ---------- */

function onHelp() {
  setStatus('Press Shift and an arrow key to place or remove a fence on that side of this tile.');
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
    refused('That fence is the hint, so it stays.');
  } else if (board.hasWall(line)) {
    board.setWall(line, false);
    setStatus('Fence removed.');
  } else if (board.wallList().length >= level.wallBudget) {
    board.refuse(target);
    refused('Every line already has a fence.'); // the budget is every buildable line
  } else if (wouldBreakCap(level, board.wallList(), line)) {
    board.refuse(target);
    refused(capMessage(wouldBreakCap(level, board.wallList(), line)));
  } else if (cutsAllRoutes(level, [...board.wallList(), line])) {
    board.refuse(target);
    refused('The gnome needs at least one way through.');
  } else {
    board.setWall(line, true);
    setStatus(`Fence placed. ${plural(board.wallList().length, 'fence')} on the board.`);
  }
  persist();
  updateCounters();
}

clearBtn.addEventListener('click', () => {
  if (!game || game.state !== 'editing') return;
  game.board.clearWalls();
  persist();
  updateCounters();
  setStatus(game.board.hintLines().length ? 'Your fences are cleared. The hint stays.' : 'Fences cleared.');
});

/* ---------- the hint ---------- */

const NO_ROOM = 'No room for a hint right now. Take a fence back.';

/** True if `line` can go down right now on top of the board's fences. */
function fits(line) {
  const { board, level } = game;
  const walls = board.wallList();
  return !wouldBreakCap(level, walls, line) && !cutsAllRoutes(level, [...walls, line]);
}

function useHint() {
  if (!game || game.state !== 'editing' || game.day.hint !== null) return;
  statusEl.classList.remove('refused');
  if (adoptStored()) return;
  if (game.day.hint !== null) {
    setStatus('The hint was already used in another tab.');
    return;
  }
  const { board, level, day } = game;
  const answer = level.answer;
  if (!Array.isArray(answer) || answer.length === 0) {
    refused('Today has no hint.');
    return;
  }
  // Hint = one fence of the stored answer. If every answer fence is already down, one of the player's
  // own becomes the hint fence (and the hint is spent), so the hint is never a free answer check.
  const missing = answer.filter((w) => !board.hasWall(w));
  const line = missing.length === 0 ? answer[0] : missing.find(fits);
  if (!line || (missing.length > 0 && !fits(line))) {
    refused(NO_ROOM); // generic on purpose: it must not say which fences are right
    return;
  }
  if (missing.length === 0) board.setWall(line, false);
  board.setWall(line, true, { hint: true });
  day.hint = lineKey(line);
  persist(); // tries keep their base score; the hint is docked when a score is shown
  setStatus(`Hint placed: one fence of a good answer. It takes ${HINT_COST} points off.`);
  updateCounters();
}
hintBtn.addEventListener('click', useHint);

/* ---------- Try ---------- */

async function run() {
  if (!game || game.state !== 'editing') return;
  const g = game;
  if (adoptStored()) return; // another tab already finished this day
  if (g.day.tries.length >= MAX_TRIES) return;
  const walls = g.board.wallList();
  const sim = simulate(g.level, walls);
  const win = sim.result === 'win';
  // Settle the try before anything animates, so a reload can never give it back. adoptStored
  // brought in tries spent in other tabs first, so this one goes on top of them.
  g.day.tries.push({
    fences: walls.length,
    won: win,
    base: win ? scoreFor(walls.length, g.level.par) : 0,
    walls: walls.map(lineKey),
  });
  if (g.day.tries.length >= MAX_TRIES) {
    g.day.done = true; // after try 3 the day ends on its own
    g.day.finishedOn = localDateString();
  }
  g.day.reviewing = win && !g.day.done; // a reload on the win screen shows the choice again
  persist();

  g.state = 'running';
  resultEl.hidden = true;
  g.board.setLocked(true);
  updateCounters();
  movesLeftEl.textContent = String(g.level.moveLimit);
  setStatus('The gnome is on the move.');

  await g.board.play(sim, {
    stepMs: STEP_MS,
    instant: reducedMotion(),
    onMove: (i) => { movesLeftEl.textContent = String(g.level.moveLimit - i); },
  });

  if (g.day.done) {
    showDone({ live: true });
    return;
  }
  if (win) {
    showReview({ live: true });
    return;
  }
  // Lost with tries left: the fences stay, the gnome goes back to the start.
  g.state = 'editing';
  g.board.resetRun();
  g.board.setLocked(false);
  movesLeftEl.textContent = String(g.level.moveLimit);
  updateCounters();
  setStatus(`He made it home. Move a fence and try again, ${plural(MAX_TRIES - g.day.tries.length, 'try')} left.`);
  goBtn.focus({ preventScroll: true });
}
goBtn.addEventListener('click', run);

/* ---------- a win with tries left: Retry or Submit ---------- */

function showReview({ live = false } = {}) {
  const g = game;
  g.state = 'review';
  g.board.setLocked(true);
  controlsEl.hidden = true;
  newDayEl.hidden = true;
  const last = g.day.tries.at(-1);
  const sim = simulate(g.level, g.board.wallList());
  g.board.play(sim, { instant: true, onMove: (i) => { movesLeftEl.textContent = String(g.level.moveLimit - i); } });
  updateCounters();
  renderResult();
  setStatus(live ? `Fenced in. ${shownScore(last, g.day.hint !== null)} out of 100.` : '');
  if (live) ($('retry-btn') ?? $('submit-btn')).focus({ preventScroll: false });
}

function retry() {
  const g = game;
  if (!g || g.state !== 'review') return;
  if (adoptStored()) return;
  if (g.day.tries.length >= MAX_TRIES) return;
  g.state = 'editing';
  g.day.reviewing = false; // a reload from here reopens the editor with these fences
  persist();
  resultEl.hidden = true;
  controlsEl.hidden = false;
  g.board.resetRun();
  g.board.setLocked(false);
  movesLeftEl.textContent = String(g.level.moveLimit);
  updateCounters();
  setStatus(`Your fences stay. Change some and try again, ${plural(MAX_TRIES - g.day.tries.length, 'try')} left.`);
  goBtn.focus({ preventScroll: true });
}

function submit() {
  const g = game;
  if (!g || g.state !== 'review') return;
  if (adoptStored()) return;
  g.day.done = true;
  g.day.finishedOn = localDateString();
  persist();
  showDone({ live: true });
}

/* ---------- a finished day ---------- */

/** The fences to show on a finished day: the best winning try's, else whatever was last on the board. */
function finalWalls(day) {
  let best = null;
  for (const t of day.tries) if (t.won && t.walls && (!best || t.base > best.base)) best = t;
  return best ? best.walls : day.walls;
}

/**
 * Lock the board in its final state and show the result. Used live and on reload.
 * `live`: the day just ended here (announce it, move focus to Share). `redraw`: wipe the board
 * first (the day was finished in another tab).
 */
function showDone({ live = false, redraw = false } = {}) {
  const g = game;
  const { board, level, day } = g;
  g.state = 'done';
  board.setLocked(true);
  controlsEl.hidden = true;
  newDayEl.hidden = true;
  triesEl.hidden = false;
  board.resetRun();
  board.clearWalls({ all: true });
  restoreWalls(finalWalls(day));
  const sim = simulate(level, board.wallList());
  board.play(sim, { instant: true, onMove: (i) => { movesLeftEl.textContent = String(level.moveLimit - i); } });
  updateCounters();
  renderResult();
  const score = dayScore(day);
  if (live) setStatus(score > 0 ? `Day done. ${score} out of 100.` : 'He made it home. Out of tries.');
  else if (redraw) setStatus('');
  else setStatus('');
  if (live) $('share-btn').focus({ preventScroll: false });
}

function actionButton(label, primary, handler) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = primary ? 'btn' : 'btn quiet';
  b.textContent = label;
  b.addEventListener('click', handler);
  return b;
}

/** The result panel: for a win still being decided (state 'review') or the finished day. */
function renderResult() {
  const { day, state } = game;
  const final = state === 'done';
  const score = dayScore(day);
  resultEl.hidden = false;
  resultEl.dataset.result = score > 0 ? 'win' : 'lose';
  resultEl.dataset.state = final ? 'done' : 'review';
  resultEl.replaceChildren();

  const head = document.createElement('div');
  head.className = 'result-head';
  const pic = document.createElement('div');
  pic.className = 'picture';
  const titles = document.createElement('div');
  titles.className = 'titles';
  const heading = document.createElement('h2');
  if (score > 0) {
    heading.textContent = final ? 'Day done' : 'Fenced in!';
    pic.appendChild(sprite('gnome-down-shrug', 'gnome-sprite'));
  } else {
    heading.textContent = 'He made it home';
    pic.classList.add('house');
    pic.setAttribute('aria-hidden', 'true');
  }
  const big = document.createElement('p');
  big.className = 'score-big';
  big.id = 'result-score';
  big.textContent = `${score} / 100`;
  titles.append(heading, big);
  head.append(pic, titles);
  resultEl.appendChild(head);

  if (score === 0) {
    const sub = document.createElement('p');
    sub.className = 'result-text';
    sub.textContent = isArchive ? 'Not this time. Try another day from the archive.' : 'Not today. A new gnome tomorrow.';
    resultEl.appendChild(sub);
  }

  const list = document.createElement('ol');
  list.className = 'try-list';
  list.id = 'try-list';
  list.setAttribute('aria-label', 'Your tries');
  day.tries.forEach((t, i) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = `Try ${i + 1}`;
    const val = document.createElement('strong');
    const shown = shownScore(t, day.hint !== null);
    val.textContent = t.won ? String(shown) : 'He made it home';
    li.append(name, val);
    if (t.won && shown === score && score > 0) li.className = 'top';
    list.appendChild(li);
  });
  resultEl.appendChild(list);

  if (day.hint !== null) {
    const hp = document.createElement('p');
    hp.className = 'hint-used';
    hp.id = 'hint-used';
    hp.textContent = score > 0 ? `Hint used, -${HINT_COST} points.` : 'Hint used.';
    resultEl.appendChild(hp);
  }

  if (!final) {
    const left = MAX_TRIES - day.tries.length;
    const top = score >= maxScore(day.hint !== null); // nothing can beat it: Submit is the only choice
    if (!top) {
      const note = document.createElement('p');
      note.className = 'try-note';
      note.id = 'try-note';
      note.textContent = 'Fewer fences score higher.';
      resultEl.appendChild(note);
    }
    const actions = document.createElement('div');
    actions.className = 'result-actions choice';
    if (!top) {
      const retryBtn = actionButton(`Retry for a better score (${left} left)`, true, retry);
      retryBtn.id = 'retry-btn';
      actions.appendChild(retryBtn);
    }
    const submitBtn = actionButton('Submit', top, submit);
    submitBtn.id = 'submit-btn';
    actions.appendChild(submitBtn);
    resultEl.appendChild(actions);
    return;
  }

  const actions = document.createElement('div');
  actions.className = 'result-actions';
  const shareBtn = actionButton('Share', true, () => share(shareBtn, shareNote, shareBox));
  shareBtn.id = 'share-btn';
  const statsBtn = actionButton('Stats', false, () => stats.show(statsBtn));
  statsBtn.id = 'result-stats-btn';
  actions.append(shareBtn, statsBtn);
  const shareNote = document.createElement('p');
  shareNote.className = 'share-note';
  shareNote.id = 'share-note';
  shareNote.setAttribute('role', 'status');
  const shareBox = document.createElement('textarea');
  shareBox.className = 'share-box';
  shareBox.id = 'share-box';
  shareBox.readOnly = true;
  shareBox.hidden = true;
  shareBox.setAttribute('aria-label', 'Result to copy');
  resultEl.append(actions, shareNote, shareBox);

  const cd = document.createElement('div');
  cd.className = 'countdown';
  const cdText = document.createElement('span');
  cdText.id = 'countdown';
  cd.appendChild(cdText);
  resultEl.appendChild(cd);
  countdownBox = { box: cd, text: cdText };
  clockTick();

  if (APP_LINK.enabled) {
    const card = document.createElement('div');
    card.className = 'app-card';
    const p = document.createElement('p');
    p.textContent = 'Want more? Play the full game.';
    const a = document.createElement('a');
    a.className = 'btn quiet';
    a.href = APP_LINK.href;
    a.textContent = APP_LINK.label;
    card.append(p, a);
    resultEl.appendChild(card);
  }
}

/* ---------- the clock ---------- */

/**
 * One tick for everything that depends on the time of day: the countdown on a finished day, and
 * the "new gnome" card on an unfinished today that has gone past midnight. Re-runs every minute
 * and when the tab comes back into view (timers sleep in the background).
 */
function clockTick() {
  clearTimeout(clockTimer);
  const now = new Date();
  const r = nextGnome(now, realToday);
  if (countdownBox && countdownBox.box.isConnected) {
    countdownBox.text.textContent = r.text;
    if (r.newDay && !countdownBox.box.querySelector('button')) {
      const play = actionButton('Play', true, goToday);
      play.id = 'play-new';
      countdownBox.box.appendChild(play);
    }
  }
  if (r.newDay && game && date === realToday && game.state !== 'done') newDayEl.hidden = false;
  if (!r.newDay) clockTimer = setTimeout(clockTick, msToNextMinute(now) + 20);
}

/* ---------- share ---------- */

function currentShareText() {
  const { day, number } = game;
  return shareText({
    number,
    mode,
    url: pageUrl(location.href, mode),
    score: dayScore(day),
    tries: day.tries,
    hint: day.hint !== null,
    archive: isArchive,
  });
}

async function share(button, note, box) {
  const text = currentShareText();
  note.textContent = '';
  box.hidden = true;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // the player closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    note.textContent = 'Copied';
    return;
  } catch {
    // Fall through to the selectable box.
  }
  box.value = text;
  box.hidden = false;
  note.textContent = 'Copy this and share it:';
  box.focus();
  box.select();
}

boot();
