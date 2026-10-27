// Which art variant each tile gets. Shared by the game board and the home-page replay so the same
// level always looks the same in both. Deterministic: no randomness, only the tile's position.
// The art itself is picked in assets/css/sprites.css from these data attributes and classes.

const isPortal = (c) => c >= 'a' && c <= 'z';

/** The teleporter letters used in a level, sorted, so pair numbers are stable (a = 1, b = 2, ...). */
export const portalLetters = (tiles) => [...new Set(tiles.join('').split('').filter(isPortal))].sort();

/**
 * Mark the element for tile (x, y) of an n x n level: grass and rock variants, bridge direction,
 * river banks, teleporter pair number, and the four board corners (they follow the frame's radius).
 */
export function decorateTile(el, tiles, n, x, y, letters) {
  const ch = tiles[y][x];
  if (y === 0 && x === 0) el.classList.add('c-tl');
  if (y === 0 && x === n - 1) el.classList.add('c-tr');
  if (y === n - 1 && x === 0) el.classList.add('c-bl');
  if (y === n - 1 && x === n - 1) el.classList.add('c-br');
  const at = (cx, cy) => (cx >= 0 && cy >= 0 && cx < n && cy < n ? tiles[cy][cx] : null);
  if (ch === '.') el.dataset.v = String(((x * 7 + y * 13) % 3) + 1);
  else if (ch === '#') el.dataset.v = (x + y) % 3 === 0 ? '2' : '1'; // every third rock is a berry bush
  else if (ch === '=') {
    // Planks follow the way the gnome walks across: the axis with more walkable neighbours (not
    // river, rock or the board edge). On a tie (a bend), run them across the axis with more water.
    const walk = (cx, cy) => { const c = at(cx, cy); return c !== null && c !== '~' && c !== '#' ? 1 : 0; };
    const wet = (cx, cy) => (at(cx, cy) === '~' ? 1 : 0);
    const wv = walk(x, y - 1) + walk(x, y + 1);
    const wh = walk(x - 1, y) + walk(x + 1, y);
    if (wv > wh || (wv === wh && wet(x - 1, y) + wet(x + 1, y) > wet(x, y - 1) + wet(x, y + 1))) el.classList.add('across-v');
  }
  if (ch === '~' || ch === '=') {
    // Water fills the grid gap towards any neighbouring water, so a river reads as one stream.
    const wet = (cx, cy) => at(cx, cy) === '~' || at(cx, cy) === '=';
    if (wet(x, y - 1)) el.classList.add('join-u');
    if (wet(x + 1, y)) el.classList.add('join-r');
    if (wet(x, y + 1)) el.classList.add('join-d');
    if (wet(x - 1, y)) el.classList.add('join-l');
  }
  if (ch === '~') {
    const water = (cx, cy) => at(cx, cy) === '~' || at(cx, cy) === '=';
    if (y > 0 && !water(x, y - 1)) el.classList.add('bank-u');
    if (x < n - 1 && !water(x + 1, y)) el.classList.add('bank-r');
    if (y < n - 1 && !water(x, y + 1)) el.classList.add('bank-d');
    if (x > 0 && !water(x - 1, y)) el.classList.add('bank-l');
  }
  if (isPortal(ch)) {
    el.dataset.pairN = String(letters.indexOf(ch) + 1);
  }
}
