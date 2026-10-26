// Places a bar (a wall, a hint) on the line beside a tile. Shared by the game and the home-page
// replay, so both draw walls the same way. Positions are measured from real tile boxes, so any
// board size, gap or zoom lines up.

/** Thickness of a wall bar for tiles this wide. */
export const barThickness = (tileWidth) => Math.max(5, Math.min(9, Math.round(tileWidth * 0.17)));

/**
 * Put `bar` on the `side` ("R" | "D" | "L" | "U") of tile `a`. `b` is the tile across that line, or
 * null on the board's border (the bar then sits on the tile's own edge).
 */
export function placeBar(bar, board, a, side, b) {
  const br = board.getBoundingClientRect();
  const ra = a.getBoundingClientRect();
  const rb = b ? b.getBoundingClientRect() : null;
  const t = barThickness(ra.width);
  const vertical = side === 'R' || side === 'L';
  let x;
  let y;
  let len;
  if (vertical) {
    const edge = side === 'R' ? ra.right : ra.left;
    const other = rb ? (side === 'R' ? rb.left : rb.right) : edge;
    x = (edge + other) / 2 - br.left;
    const gap = rb ? Math.abs(other - edge) : 0;
    len = ra.height + gap + t / 2;
    y = ra.top - br.top - gap / 2 - t / 4;
    bar.style.width = `${t}px`;
    bar.style.height = `${len}px`;
    bar.style.left = `${x - t / 2}px`;
    bar.style.top = `${y}px`;
  } else {
    const edge = side === 'D' ? ra.bottom : ra.top;
    const other = rb ? (side === 'D' ? rb.top : rb.bottom) : edge;
    y = (edge + other) / 2 - br.top;
    const gap = rb ? Math.abs(other - edge) : 0;
    len = ra.width + gap + t / 2;
    x = ra.left - br.left - gap / 2 - t / 4;
    bar.style.width = `${len}px`;
    bar.style.height = `${t}px`;
    bar.style.left = `${x}px`;
    bar.style.top = `${y - t / 2}px`;
  }
}
