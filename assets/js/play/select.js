// Level select: Levels | Daily tabs, then a grid of buttons grouped by board size with best stars.
// Every level is open while the game is in development (no locks).
import { bestStars } from './storage.js';
import { starsMarkup } from './icons.js';

const TUTORIAL_COUNT = 5; // the first five levels teach one idea each

function groupFor(level, i) {
  if (level.size === 9) return 'Hard, 9x9';
  return i < TUTORIAL_COUNT ? 'Tutorial, 7x7' : 'Main, 7x7';
}

/** Tabs shared by the select screens. `current` is "levels", "daily" or "lab". */
export function modeTabs(current, onPick) {
  const nav = document.createElement('nav');
  nav.className = 'mode-tabs';
  nav.setAttribute('aria-label', 'Mode');
  for (const [id, label, href] of [['levels', 'Levels', './'], ['daily', 'Daily', './?daily'], ['lab', 'Lab', './?lab']]) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    if (id === current) a.setAttribute('aria-current', 'page');
    a.addEventListener('click', (e) => {
      e.preventDefault();
      onPick(id);
    });
    nav.appendChild(a);
  }
  return nav;
}

export function renderSelect(root, levels, { onPick, onMode }) {
  const won = levels.filter((l) => bestStars(l.id) > 0).length;
  const total = levels.reduce((sum, l) => sum + bestStars(l.id), 0);
  // The first level without 3 stars; level 1 once everything is perfect.
  const nextIndex = Math.max(0, levels.findIndex((l) => bestStars(l.id) < 3));

  root.innerHTML = '';
  root.appendChild(modeTabs('levels', onMode));
  const intro = document.createElement('div');
  intro.className = 'select-intro';
  const summary = document.createElement('p');
  summary.className = 'select-summary';
  summary.textContent = won === 0
    ? 'Stop the robot with as few walls as you can.'
    : `${won} of ${levels.length} solved. ${total} of ${levels.length * 3} stars.`;
  intro.appendChild(summary);
  const cont = document.createElement('button');
  cont.type = 'button';
  cont.className = 'btn';
  cont.id = 'play-next';
  cont.textContent = `Play level ${nextIndex + 1}`;
  cont.addEventListener('click', () => onPick(nextIndex));
  intro.appendChild(cont);
  root.appendChild(intro);

  let current = null;
  let grid = null;
  levels.forEach((level, i) => {
    const group = groupFor(level, i);
    if (group !== current) {
      current = group;
      const h = document.createElement('h2');
      h.className = 'group-title';
      h.textContent = group;
      root.appendChild(h);
      grid = document.createElement('div');
      grid.className = 'level-grid';
      root.appendChild(grid);
    }
    const stars = bestStars(level.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'level-btn';
    if (i === nextIndex) b.classList.add('next');
    b.dataset.level = String(i + 1);
    const label = stars === 0 ? 'not played' : `${stars} star${stars === 1 ? '' : 's'}`;
    b.setAttribute('aria-label', `Level ${i + 1}, ${label}`);
    b.innerHTML = `<span class="num">${i + 1}</span><span class="level-stars">${starsMarkup(stars)}</span>`;
    b.addEventListener('click', () => onPick(i));
    grid.appendChild(b);
  });
}

export const LAB_NOTE = 'Experimental rules: walls can go next to bridges, teleporters, and up to two sides of the robot and beacon.';

/** The Lab tab: its note and a button per lab level with best stars. */
export function renderLab(root, levels, { onPick, onMode, failed = false }) {
  root.innerHTML = '';
  root.appendChild(modeTabs('lab', onMode));
  const note = document.createElement('p');
  note.className = 'lab-note';
  note.id = 'lab-note';
  note.textContent = LAB_NOTE;
  root.appendChild(note);
  if (failed || levels.length === 0) {
    const p = document.createElement('p');
    p.className = 'select-summary';
    p.textContent = 'The lab levels did not load. Check your connection and try again.';
    root.appendChild(p);
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'level-grid lab-grid';
  levels.forEach((level, i) => {
    const stars = bestStars(level.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'level-btn';
    b.dataset.level = String(i + 1);
    b.dataset.lab = String(i + 1);
    const label = stars === 0 ? 'not played' : `${stars} star${stars === 1 ? '' : 's'}`;
    b.setAttribute('aria-label', `Lab ${i + 1}, ${label}`);
    b.innerHTML = `<span class="num">${i + 1}</span><span class="level-stars">${starsMarkup(stars)}</span>`;
    b.addEventListener('click', () => onPick(i));
    grid.appendChild(b);
  });
  root.appendChild(grid);
}
