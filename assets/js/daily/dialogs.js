// The two dialogs: how to play and stats. Both are native <dialog>s, so focus stays inside and
// Escape closes them.
import { sprite } from '../sprites.js';
import { markSeenHowTo, allDays } from './store.js';
import { computeStats } from './streak.js';
import { starsMarkup } from '../play/icons.js';
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

const ROWS = [['3', '3 stars'], ['2', '2 stars'], ['1', '1 star'], ['lost', 'Lost']];

/** Fill the stats dialog for `today` and open it. */
function renderStats(today) {
  const s = computeStats(allDays(), today);
  const body = $('stats-body');
  body.replaceChildren();
  const h = document.createElement('h2');
  h.id = 'stats-title';
  h.textContent = 'Stats';
  body.appendChild(h);

  const grid = document.createElement('dl');
  grid.className = 'stats-grid';
  for (const [label, value] of [['Played', s.played], ['Win %', s.winPct], ['Streak', s.current], ['Best', s.best]]) {
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
    t.textContent = 'Results';
    const list = document.createElement('ul');
    list.className = 'dist';
    list.setAttribute('aria-label', 'Results by stars');
    const max = Math.max(1, ...Object.values(s.dist));
    for (const [key, label] of ROWS) {
      const li = document.createElement('li');
      if (s.today === key) li.className = 'today';
      const name = document.createElement('span');
      name.textContent = label;
      const bar = document.createElement('span');
      bar.className = 'bar';
      bar.style.width = `${Math.max(12, Math.round((s.dist[key] / max) * 100))}%`;
      bar.textContent = String(s.dist[key]);
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
}

export function setupStats(getToday) {
  const dlg = $('stats-dlg');
  closeOnBackdrop(dlg);
  const show = (opener) => {
    renderStats(getToday());
    open(dlg, opener);
  };
  $('stats-btn').addEventListener('click', () => show($('stats-btn')));
  return { show };
}

/** What a row of the archive says about its day. */
function resultCell(result) {
  const el = document.createElement('span');
  el.className = `arch-result ${result.kind}`;
  if (result.kind === 'won') {
    el.innerHTML = starsMarkup(result.stars);
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', result.stars === 1 ? '1 star' : `${result.stars} stars`);
  } else {
    el.textContent = { lost: 'Lost', progress: 'In progress', none: 'Not played' }[result.kind];
  }
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
      b.append(num, when, resultCell(row.result));
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
