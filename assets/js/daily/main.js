// The standalone daily page: one puzzle a day, three tries, one free hint, a share button.
// Reuses the engine, the board and the sprites. It does not import the full game's main.js or storage.
import { parseLevel, simulate, cutsAllRoutes, wouldBreakCap, stars as scoreStars } from '../../../src/game/index.js';
import { createBoard } from '../play/board.js';
import { capMessage, lineKey } from '../play/lines.js';
import { starsMarkup } from '../play/icons.js';
import { localDateString, parseDate, dayIndex, formatDaily } from '../play/daily.js';
import { preloadSprites, sprite } from '../sprites.js';
import { APP_LINK, MAX_TRIES, DAILY_URL } from './config.js';
import { freshDay, parseLineKey, mergeDay } from './record.js';
import { loadStore, getDay, saveDay, allDays, seenHowTo, refresh, onExternalChange } from './store.js';
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
const resultEl = $('result');
const answerNoteEl = $('answer-note');
const wallsLabelEl = $('walls-label');
const newDayEl = $('new-day');

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const plural = (n, word) => `${n} ${n === 1 ? word : word === 'try' ? 'tries' : `${word}s`}`;

/** The date being played: today, or one of the 29 days before it (`?date=YYYY-MM-DD`, the archive). */
const realToday = localDateString();
const route = classifyDate(new URLSearchParams(location.search).get('date'), realToday);
const date = route.date;
const isArchive = route.kind === 'archive';
const goToday = () => { location.href = location.pathname; };

let game = null; // { level, board, number, day, state: 'editing' | 'running' | 'done' }
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

/** Filled pips are tries left; the won try is a tick; spent and unused-after-the-end pips are empty. */
function renderPips() {
  const { tries, won, done } = game.day;
  [...pipsEl.children].forEach((pip, i) => {
    pip.className = won && i === tries - 1 ? 'won' : !done && i >= tries ? 'left' : '';
  });
  pipsEl.setAttribute('aria-label', won ? `Won on try ${tries}` : done ? 'No tries left' : `${plural(MAX_TRIES - tries, 'try')} left`);
}

function setStatus(text, cls = '') {
  statusEl.textContent = text;
  statusEl.classList.remove('refused', 'note');
  if (cls) statusEl.classList.add(cls);
}

/** A press that can't place a wall: say why, loudly. */
function refused(text) {
  setStatus(text);
  void statusEl.offsetWidth;
  statusEl.classList.add('refused');
}

function updateCounters() {
  const { board, level, day, state } = game;
  const used = board.wallList().length;
  wallsUsedEl.textContent = `${used} / ${level.wallBudget}`;
  const mine = used - board.hintLines().length;
  const editing = state === 'editing';
  clearBtn.disabled = mine === 0 || !editing;
  hintBtn.disabled = !editing || day.hint !== null;
  hintBtn.textContent = day.hint !== null ? 'Hint used' : 'Hint (1)';
  goBtn.disabled = !editing;
  goBtn.textContent = day.tries === 0 ? 'Go' : `Try again (${MAX_TRIES - day.tries} left)`;
  renderPips();
}

function persist() {
  game.day.walls = game.board.wallList().map(lineKey);
  saveDay(date, game.day);
}

/**
 * Take in what another tab saved for this date: more tries, a used hint, a finished day. Returns
 * true if the day is finished now (and shown as such). The board's own walls are kept.
 */
function adoptStored() {
  const g = game;
  refresh();
  const stored = getDay(date);
  if (!stored || g.state === 'running' || g.state === 'done') return g.state === 'done';
  const changed = stored.tries > g.day.tries || stored.done || (stored.hint !== null && g.day.hint === null);
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
  const before = game.day.tries;
  if (adoptStored()) return;
  if (game.day.tries !== before) setStatus(`Updated from another tab. ${plural(MAX_TRIES - game.day.tries, 'try')} left today.`);
});

/* ---------- starting a day ---------- */

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
  setupWordmark();
  dateLineEl.textContent = formatDaily(date);

  let data;
  try {
    const res = await fetch(DAILY_URL);
    if (!res.ok) throw new Error(`${res.status}`);
    data = await res.json();
    await preloadSprites();
  } catch {
    failed('The daily did not load. Check your connection and try again.');
    return;
  }
  loading.hidden = true;

  const howto = setupHowTo();
  stats = setupStats(() => realToday);
  setupArchive({
    getRows: () => archiveRows({ days: allDays(), today: realToday, start: data.start, count: data.levels.length }),
    onPick: (row) => { location.href = row.today ? location.pathname : `${location.pathname}?date=${row.date}`; },
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
  else startDay(parseLevel(data.levels[i]), i + 1);
  clockTick();

  if (!seenHowTo()) howto.show($('help-btn'));
}

function startDay(level, number) {
  const day = getDay(date) || freshDay();
  game = { level, number, day, state: 'editing', board: null };
  titleEl.textContent = `Daily #${number}`;
  if (isArchive) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = 'Archive';
    titleEl.append(' ', tag);
    $('today-link').hidden = false;
  }
  document.title = `Daily #${number} · Gnome Sweet Gnome`;
  triesEl.hidden = false;
  gameView.hidden = false;

  game.board = createBoard(boardEl, level, { onLine, onHelp });
  game.board.fit();
  parEl.textContent = String(level.par);
  limitEl.textContent = String(level.moveLimit);
  movesLeftEl.textContent = String(level.moveLimit);

  if (day.done) {
    showDone();
    return;
  }
  restoreWalls();
  updateCounters();
  if (day.tries > 0) setStatus(`Welcome back. ${plural(MAX_TRIES - day.tries, 'try')} left today.`);
  else setStatus("Tap a line between two tiles to place a fence. Make the gnome's route longer than his move limit.");
}

/** Put the saved walls back, the hint wall in hint style. Lines that no longer fit the level are skipped. */
function restoreWalls() {
  const { board, level, day } = game;
  for (const k of day.walls) {
    const line = parseLineKey(k);
    if (!line || board.wallList().length >= level.wallBudget) continue;
    if (line[0] < 0 || line[1] < 0 || line[0] >= level.size || line[1] >= level.size) continue;
    if (!level.lineBuildable(line[0], line[1], line[2])) continue;
    board.setWall(line, true, { hint: k === day.hint });
  }
}

/* ---------- placing walls ---------- */

function onHelp() {
  setStatus('Press Shift and an arrow key to place or remove a wall on that side of this tile.');
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
    wallsUsedEl.parentElement.classList.remove('refused');
    void wallsUsedEl.offsetWidth;
    wallsUsedEl.parentElement.classList.add('refused');
    refused(`All ${plural(level.wallBudget, 'fence')} placed. Tap a fence to take it back.`);
  } else if (wouldBreakCap(level, board.wallList(), line)) {
    board.refuse(target);
    refused(capMessage(wouldBreakCap(level, board.wallList(), line)));
  } else if (cutsAllRoutes(level, [...board.wallList(), line])) {
    board.refuse(target);
    refused('The gnome needs at least one way through.');
  } else {
    board.setWall(line, true);
    const used = board.wallList().length;
    setStatus(used === level.wallBudget ? 'All fences placed. Press Go.' : `Fence placed. ${used} of ${level.wallBudget} used.`);
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

/** Why `line` can't go down right now on top of the board's walls, or null if it can. */
function whyNot(line) {
  const { board, level } = game;
  const walls = board.wallList();
  if (walls.length >= level.wallBudget) return `All ${plural(level.wallBudget, 'fence')} are placed, so there is no room for the hint. Take one back first.`;
  const cap = wouldBreakCap(level, walls, line);
  if (cap) return `${capMessage(cap)} Take a fence back to make room for the hint.`;
  if (cutsAllRoutes(level, [...walls, line])) return 'Your fences leave no room for that hint: it would cut off the gnome completely. Take one back and try again.';
  return null;
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
  const missing = answer.filter((w) => !board.hasWall(w));
  if (missing.length === 0) {
    setStatus('Every fence of the answer is already on the board. No hint used.');
    return;
  }
  // The first answer fence that can go down now; if none can, say why for the first and keep the hint.
  const line = missing.find((w) => whyNot(w) === null);
  if (!line) {
    refused(`${whyNot(missing[0])} No hint used.`);
    return;
  }
  board.setWall(line, true, { hint: true });
  day.hint = lineKey(line);
  persist();
  setStatus(`Hint placed: one fence of a par answer. It costs 1 star.`);
  updateCounters();
}
hintBtn.addEventListener('click', useHint);

/* ---------- Go ---------- */

async function run() {
  if (!game || game.state !== 'editing') return;
  const g = game;
  if (adoptStored()) return; // another tab already finished this day
  const walls = g.board.wallList();
  const sim = simulate(g.level, walls);
  // Settle the try before anything animates, so a reload can never give it back. adoptStored
  // brought in tries spent in other tabs first, so this one goes on top of them.
  g.day.tries++;
  if (sim.result === 'win') {
    g.day.won = true;
    g.day.done = true;
    g.day.stars = scoreStars(g.level.par, walls.length, g.level.wallBudget, g.day.hint !== null ? 1 : 0);
  } else if (g.day.tries >= MAX_TRIES) {
    g.day.done = true;
  }
  if (g.day.done) g.day.finishedOn = localDateString();
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
  // Lost with tries left: the fences stay, the gnome goes back to the start.
  g.state = 'editing';
  g.board.resetRun();
  g.board.setLocked(false);
  movesLeftEl.textContent = String(g.level.moveLimit);
  updateCounters();
  setStatus(`He made it home. Move a fence and try again, ${plural(MAX_TRIES - g.day.tries, 'try')} left.`);
  goBtn.focus({ preventScroll: true });
}
goBtn.addEventListener('click', run);

/* ---------- a finished day ---------- */

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
  renderPips();
  if (redraw) {
    board.resetRun();
    board.clearWalls({ all: true });
  }

  let walls = board.wallList();
  if (day.won && walls.length === 0 && day.walls.length > 0) {
    // Reloaded onto a won day: draw its final walls.
    restoreWalls();
    walls = board.wallList();
  }
  let sim;
  if (day.won) {
    sim = simulate(level, walls);
    wallsUsedEl.textContent = `${walls.length} / ${level.wallBudget}`;
    wallsLabelEl.textContent = 'Walls';
    setStatus(live ? `Fenced in on try ${day.tries}, ${day.stars} ${day.stars === 1 ? 'star' : 'stars'}.` : '');
    answerNoteEl.hidden = true;
  } else {
    // Lost: show one par answer in the hint style.
    board.clearWalls({ all: true });
    for (const w of level.answer) board.setWall(w, true, { hint: true });
    sim = simulate(level, level.answer);
    wallsLabelEl.textContent = 'Answer';
    wallsUsedEl.textContent = `${level.answer.length} / ${level.wallBudget}`;
    setStatus(live ? 'He made it home. Out of tries.' : '');
    answerNoteEl.textContent = `One way to fence him in (par ${level.par}).`;
    answerNoteEl.hidden = false;
  }
  board.play(sim, { instant: true, onMove: (i) => { movesLeftEl.textContent = String(level.moveLimit - i); } });
  renderResult();
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

function renderResult() {
  const { level, day, board } = game;
  resultEl.hidden = false;
  resultEl.dataset.result = day.won ? 'win' : 'lose';
  resultEl.replaceChildren();

  const heading = document.createElement('h2');
  const head = document.createElement('div');
  head.className = 'result-head';
  const pic = document.createElement('div');
  pic.className = 'picture';
  const titles = document.createElement('div');
  titles.className = 'titles';
  const line = document.createElement('p');
  line.className = 'win-line';
  line.id = 'try-line';

  const used = day.won ? board.wallList().length : null;
  if (day.won) {
    heading.textContent = 'Fenced in!';
    pic.appendChild(sprite('gnome-down-shrug', 'gnome-sprite'));
    const starsEl = document.createElement('div');
    starsEl.className = 'result-stars';
    starsEl.setAttribute('role', 'img');
    starsEl.setAttribute('aria-label', `${day.stars} of 3 stars`);
    starsEl.dataset.stars = String(day.stars);
    starsEl.innerHTML = starsMarkup(day.stars);
    titles.append(heading, starsEl);
    line.textContent = `Won on try ${day.tries} of ${MAX_TRIES}`;
  } else {
    heading.textContent = 'He made it home';
    pic.classList.add('house');
    pic.setAttribute('aria-hidden', 'true');
    const sub = document.createElement('p');
    sub.className = 'result-text';
    sub.textContent = isArchive ? 'Not this time. Try another day from the archive.' : 'Not today. A new gnome tomorrow.';
    titles.append(heading, sub);
    line.textContent = `Lost, all ${MAX_TRIES} tries used`;
  }
  head.append(pic, titles);
  resultEl.append(head, line);

  if (day.won) {
    const par = document.createElement('p');
    par.className = 'par';
    const strong = document.createElement('strong');
    strong.textContent = `Par ${level.par}`;
    par.append(strong, ` You used ${plural(used, 'fence')}.`);
    resultEl.appendChild(par);
  }
  if (day.hint !== null) {
    const hp = document.createElement('p');
    hp.className = 'hint-used';
    hp.id = 'hint-used';
    hp.textContent = day.won ? 'Hint used, −1 star.' : 'Hint used.';
    resultEl.appendChild(hp);
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
  const { level, day, number } = game;
  return shareText({
    number,
    url: pageUrl(location.href),
    par: level.par,
    walls: day.won ? day.walls.length : 0,
    archive: isArchive,
    tries: day.tries,
    won: day.won,
    stars: day.stars,
    hint: day.hint !== null,
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
