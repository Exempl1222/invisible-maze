// Small inline SVGs shared by the level select and the game.
const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z';

/** Three stars, `n` of them filled. Decorative: the caller labels the group. */
export function starsMarkup(n, total = 3) {
  let out = '';
  for (let i = 0; i < total; i++) {
    out += `<svg class="star${i < n ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
  }
  return out;
}
