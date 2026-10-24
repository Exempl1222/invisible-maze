// Small inline SVGs shared by the level select and the game.
export const ROBOT_SVG = `<svg viewBox="0 0 32 32" aria-hidden="true">
  <rect x="6" y="9" width="20" height="16" rx="5" fill="var(--robot)"/>
  <rect x="10" y="14" width="4" height="4" rx="1" fill="var(--night)"/>
  <rect x="18" y="14" width="4" height="4" rx="1" fill="var(--night)"/>
  <rect x="15" y="3" width="2" height="6" fill="var(--robot)"/>
  <circle cx="16" cy="3" r="2" fill="var(--robot)"/>
</svg>`;

const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z';

/** Three stars, `n` of them filled. Decorative: the caller labels the group. */
export function starsMarkup(n, total = 3) {
  let out = '';
  for (let i = 0; i < total; i++) {
    out += `<svg class="star${i < n ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
  }
  return out;
}

export const LOCK_SVG = `<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none"/></svg>`;
