// The text a player shares. A pure function so the format is tested. No DOM.
import { MAX_TRIES } from './config.js';

/** The page's own URL with no query string or hash. */
export function pageUrl(href) {
  const u = new URL(href);
  u.search = '';
  u.hash = '';
  return u.toString();
}

/**
 * { number, url, par, walls, tries, won, stars, hint, archive } -> the share text.
 *   Gnome Sweet Gnome #1 🍄
 *   ⭐⭐⭐ 4 fences (par 4)
 *   🟥🟩 2/3
 *   https://.../daily/
 */
export function shareText({ number, url, par, walls, tries, won, stars, hint, archive }) {
  const bulb = hint ? ' 💡' : '';
  const result = won
    ? `${'⭐'.repeat(stars)} ${walls} ${walls === 1 ? 'fence' : 'fences'} (par ${par})${bulb}`
    : `🏠 He made it home${bulb}`;
  const squares = won ? `${'🟥'.repeat(tries - 1)}🟩 ${tries}/${MAX_TRIES}` : `${'🟥'.repeat(tries)} X/${MAX_TRIES}`;
  return [`Gnome Sweet Gnome #${number}${archive ? ' (archive)' : ''} 🍄`, result, squares, url].join('\n');
}
