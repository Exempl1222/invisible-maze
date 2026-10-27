// The text a player shares. A pure function so the format is tested. No DOM.
import { MODE_LABEL } from './config.js';

/** The page's own URL with no query string or hash, then `?mode=` for the mode played. */
export function pageUrl(href, mode) {
  const u = new URL(href);
  u.search = '';
  u.hash = '';
  if (mode) u.searchParams.set('mode', mode);
  return u.toString();
}

/**
 * { number, mode, url, score, tries, hint, archive } -> the share text. `tries` is [{ won }].
 *   Gnome Sweet Gnome #1 Hard 🍄
 *   82/100 💡
 *   🟥🟩🟩
 *   https://.../daily/?mode=hard
 * One square per try used (🟥 loss, 🟩 win). 💡 only if the hint was used. A day with no win reads
 * `0/100 🏠`. Archive days put `(archive)` after the number.
 */
export function shareText({ number, mode, url, score, tries, hint, archive }) {
  const head = `Gnome Sweet Gnome #${number}${archive ? ' (archive)' : ''} ${MODE_LABEL[mode] ?? mode} 🍄`;
  const line = `${score}/100${score === 0 ? ' 🏠' : ''}${hint ? ' 💡' : ''}`;
  const squares = tries.map((t) => (t.won ? '🟩' : '🟥')).join('');
  return [head, line, squares, url].join('\n');
}
