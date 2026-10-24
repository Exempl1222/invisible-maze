// Level select: a grid of buttons grouped by board size, with best stars and in-order unlocks.
import { bestStars } from './storage.js';
import { starsMarkup, LOCK_SVG } from './icons.js';

const GROUPS = { 5: 'Tutorial, 5x5', 7: 'Main, 7x7', 9: 'Hard, 9x9' };

/** Level N+1 unlocks once N has any stars. Level 1 is always open. */
export function isUnlocked(levels, i) {
  return i === 0 || bestStars(levels[i - 1].id) > 0;
}

export function renderSelect(root, levels, onPick) {
  const won = levels.filter((l) => bestStars(l.id) > 0).length;
  const total = levels.reduce((sum, l) => sum + bestStars(l.id), 0);
  const nextIndex = levels.findIndex((l) => bestStars(l.id) === 0);

  root.innerHTML = '';
  const intro = document.createElement('div');
  intro.className = 'select-intro';
  const summary = document.createElement('p');
  summary.className = 'select-summary';
  summary.textContent = won === 0
    ? 'Stop the robot with as few walls as you can.'
    : `${won} of ${levels.length} solved. ${total} of ${levels.length * 3} stars.`;
  intro.appendChild(summary);
  if (nextIndex >= 0) {
    const cont = document.createElement('button');
    cont.type = 'button';
    cont.className = 'btn';
    cont.textContent = won === 0 ? 'Play level 1' : `Play level ${nextIndex + 1}`;
    cont.addEventListener('click', () => onPick(nextIndex));
    intro.appendChild(cont);
  }
  root.appendChild(intro);

  let currentSize = null;
  let grid = null;
  levels.forEach((level, i) => {
    if (level.size !== currentSize) {
      currentSize = level.size;
      const h = document.createElement('h2');
      h.className = 'group-title';
      h.textContent = GROUPS[level.size] || `${level.size}x${level.size}`;
      root.appendChild(h);
      grid = document.createElement('div');
      grid.className = 'level-grid';
      root.appendChild(grid);
    }
    const stars = bestStars(level.id);
    const open = isUnlocked(levels, i);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'level-btn';
    if (i === nextIndex) b.classList.add('next');
    b.dataset.level = String(i + 1);
    const label = !open ? 'locked' : stars === 0 ? 'not played' : `${stars} star${stars === 1 ? '' : 's'}`;
    b.setAttribute('aria-label', `Level ${i + 1}, ${label}`);
    b.disabled = !open;
    b.innerHTML = `<span class="num">${i + 1}</span><span class="level-stars">${open ? starsMarkup(stars) : LOCK_SVG}</span>`;
    b.addEventListener('click', () => onPick(i));
    grid.appendChild(b);
  });
}
