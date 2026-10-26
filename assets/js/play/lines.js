// Pure helpers for line walls: which line a press means, why a line can't take a wall, and the
// words for screen readers. No DOM, no rules: whether a line is buildable comes from the engine.

/** A wall is [x, y, "R" | "D"]. Key used in sets and maps. */
export const lineKey = (w) => `${w[0]},${w[1]},${w[2]}`;

/**
 * Which side of a tile a press at (fx, fy) means, with fx and fy the fraction (0 to 1) across
 * the tile. The two diagonals split the tile into four triangles, one per side. A press exactly
 * on a diagonal goes to the horizontal or vertical side by a fixed rule, so every point has one.
 */
export function sideAt(fx, fy) {
  const dx = fx - 0.5;
  const dy = fy - 0.5;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'R' : 'L';
  return dy > 0 ? 'D' : 'U';
}

/** The canonical wall for the `side` of tile (x, y), or null on the board's border. */
export function lineFor(x, y, side, size) {
  if (side === 'R') return x < size - 1 ? [x, y, 'R'] : null;
  if (side === 'D') return y < size - 1 ? [x, y, 'D'] : null;
  if (side === 'L') return x > 0 ? [x - 1, y, 'R'] : null;
  return y > 0 ? [x, y - 1, 'D'] : null;
}

/**
 * Press position in pixels inside a square board -> { x, y, side, line }.
 * Tiles are `pitch` apart (tile plus gap). A press in a gap belongs to the tile before it, so
 * every point has exactly one answer. Border sides give line = null.
 */
export function pointTarget(px, py, boardPx, size, gap) {
  const tile = (boardPx - (size - 1) * gap) / size;
  const pitch = tile + gap;
  const clamp = (n) => Math.min(size - 1, Math.max(0, n));
  const x = clamp(Math.floor(px / pitch));
  const y = clamp(Math.floor(py / pitch));
  const fx = Math.min(0.999, Math.max(0, (px - x * pitch) / pitch));
  const fy = Math.min(0.999, Math.max(0, (py - y * pitch) / pitch));
  const side = sideAt(fx, fy);
  return { x, y, side, line: lineFor(x, y, side, size) };
}

const isPortal = (c) => c >= 'a' && c <= 'z';

/**
 * Can this target take a wall, and if not, why in plain words. `target` is { x, y, side }; `line`
 * is its canonical wall or null for the border.
 */
export function explainLine(level, line, target) {
  if (line === null) return { ok: false, why: "That's the edge of the board." };
  const [x, y, dir] = line;
  const a = level.tile(x, y);
  const b = level.tile(dir === 'R' ? x + 1 : x, dir === 'D' ? y + 1 : y);
  if (level.lineBuildable(x, y, dir)) return { ok: true, why: null };
  const pair = [a, b];
  if (pair.includes('~')) return { ok: false, why: "There's nothing to block next to a river." };
  if (pair.includes('#')) return { ok: false, why: "There's nothing to block next to a rock." };
  return { ok: false, why: "That line can't be walled." };
}

/** Why a wall would break the side cap ("start" or "beacon", from the engine's wouldBreakCap). */
export function capMessage(kind) {
  return kind === 'beacon' ? 'The beacon can only be walled on two sides.' : 'The robot can only be walled on two sides.';
}

const SIDE_WORD = { U: 'top', R: 'right', D: 'bottom', L: 'left' };

/** "walls on right and bottom" for a tile's label, or '' when it has none. `has(line)` says if walled. */
export function wallSidesText(x, y, size, has) {
  const words = [];
  for (const side of ['U', 'R', 'D', 'L']) {
    const line = lineFor(x, y, side, size);
    if (line && has(line)) words.push(SIDE_WORD[side]);
  }
  if (words.length === 0) return '';
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
  return `${words.length === 1 ? 'wall' : 'walls'} on ${list}`;
}
