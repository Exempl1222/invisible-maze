// The two dialogs: how to play and stats. Both are native <dialog>s, so focus stays inside and
// Escape closes them.
import { sprite } from '../sprites.js';
import { markSeenHowTo, allDays } from './store.js';
import { computeStats } from './streak.js';
import { BANDS } from './score.js';
import { MODES, MODE_LABEL } from './config.js';
import { resultText } from './archive.js';
import { formatDaily } from '../play/daily.js';

const $ = (id) => document.getElementById(id);

/** Open a dialog and give focus back to `opener` when it closes. */
function open(dlg, opener) {
  if (dlg.open) return;
  dlg.showModal();
  const back = () => {
    dlg.removeEventListener('close', back);
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
  };
  dlg.addEventListener('close', back);
}

/** Close on a press on the backdrop (the dialog element itself), not on its content. */
function closeOnBackdrop(dlg) {
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}

export function setupHowTo() {
  const dlg = $('howto-dlg');
  $('howto-art-1').appendChild(sprite('gnome-down-walk', 'gnome-sprite'));
  $('howto-art-2').appendChild(sprite('wall-v', 'wall-art'));
  dlg.addEventListener('close', markSeenHowTo); // closing it, any way, counts as seen
  $('howto-close').addEventListener('click', () => dlg.close());
  closeOnBackdrop(dlg);
  $('help-btn').addEventListener('click', () => open(dlg, $('help-btn')));
  return { show: (opener) => open(dlg, opener) };
}

/** Fill the stats dialog for `mode` as seen on `today`. `focusTab` puts focus back on the chosen tab. */
function renderStats(today, mode, rerender, focusTab = false) {
  const s = computeStats(allDays()[mode], today);
  const body = $('stats-body');
  body.replaceChildren();
  const h = document.createElement('h2');
  h.id = 'stats-title';
  h.textContent = 'Stats';
  body.appendChild(h);

  const tabs = document.createElement('div');
  tabs.className = 'seg';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Puzzle size');
  for (const m of MODES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = `stats-tab-${m}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(m === mode));
    b.textContent = MODE_LABEL[m];
    b.addEventListener('click', () => rerender(m, true));
    tabs.appendChild(b);
  }
  body.appendChild(tabs);

  const grid = document.createElement('dl');
  grid.className = 'stats-grid';
  const cells = [['Played', s.played], ['Win %', s.winPct], ['Average', s.average], ['Best', s.bestScore], ['Streak', s.current], ['Best streak', s.bestStreak]];
  for (const [label, value] of cells) {
    const cell = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = String(value);
    cell.append(dt, dd);
    grid.appendChild(cell);
  }
  body.appendChild(grid);

  if (s.played === 0) {
    const p = document.createElement('p');
    p.className = 'stats-empty';
    p.textContent = 'Finish a daily to start your stats.';
    body.appendChild(p);
  } else {
    const t = document.createElement('p');
    t.className = 'dist-title';
    t.textContent = 'Scores';
    const list = document.createElement('ul');
    list.className = 'dist';
    list.setAttribute('aria-label', 'Days by score');
    const max = Math.max(1, ...Object.values(s.dist));
    for (const band of BANDS) {
      const li = document.createElement('li');
      if (s.today === band.key) li.className = 'today';
      const name = document.createElement('span');
      name.textContent = band.label;
      const bar = document.createElement('span');
      bar.className = 'bar';
      bar.style.width = `${Math.max(12, Math.round((s.dist[band.key] / max) * 100))}%`;
      bar.textContent = String(s.dist[band.key]);
      li.append(name, bar);
      list.appendChild(li);
    }
    body.append(t, list);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn';
  close.textContent = 'Close';
  close.addEventListener('click', () => $('stats-dlg').close());
  body.appendChild(close);
  if (focusTab) $(`stats-tab-${mode}`).focus();
}

/** The stats dialog. `getToday()` is the page's date, `getMode()` the mode on screen (the tab it opens on). */
export function setupStats(getToday, getMode) {
  const dlg = $('stats-dlg');
  closeOnBackdrop(dlg);
  const draw = (mode, focusTab) => renderStats(getToday(), mode, draw, focusTab);
  const show = (opener) => {
    draw(getMode(), false);
    open(dlg, opener);
  };
  $('stats-btn').addEventListener('click', () => show($('stats-btn')));
  return { show };
}

/** What a row of the archive says about its day: both modes, like `Easy 88 · Hard -`. */
function resultCell(results) {
  const el = document.createElement('span');
  el.className = 'arch-result';
  MODES.forEach((m, i) => {
    if (i > 0) el.append(' · ');
    const part = document.createElement('span');
    part.className = `arch-part ${results[m].kind}`;
    part.dataset.mode = m;
    part.textContent = `${MODE_LABEL[m]} ${resultText(results[m])}`;
    el.appendChild(part);
  });
  return el;
}

/**
 * The archive: the last 30 days, newest first. `getRows()` gives the rows (see archiveRows),
 * `onPick(row)` goes to that day. `currentDate` is the day on screen.
 */
export function setupArchive({ getRows, onPick, currentDate }) {
  const dlg = $('archive-dlg');
  closeOnBackdrop(dlg);
  const show = (opener) => {
    const body = $('archive-body');
    body.replaceChildren();
    const h = document.createElement('h2');
    h.id = 'archive-title';
    h.textContent = 'Archive';
    const list = document.createElement('ul');
    list.className = 'archive-list';
    for (const row of getRows()) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'arch-row';
      b.dataset.date = row.date;
      if (row.date === currentDate) b.setAttribute('aria-current', 'date');
      const num = document.createElement('span');
      num.className = 'arch-num';
      num.textContent = `#${row.number}`;
      const when = document.createElement('span');
      when.className = 'arch-date';
      when.textContent = formatDaily(row.date);
      if (row.today) {
        const tag = document.createElement('span');
        tag.className = 'arch-today';
        tag.textContent = 'Today';
        when.append(' ', tag);
      }
      b.append(num, when, resultCell(row.results));
      b.addEventListener('click', () => onPick(row));
      li.appendChild(b);
      list.appendChild(li);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn';
    close.textContent = 'Close';
    close.addEventListener('click', () => dlg.close());
    body.append(h, list, close);
    open(dlg, opener);
  };
  $('archive-btn').addEventListener('click', () => show($('archive-btn')));
  return { show };
}
