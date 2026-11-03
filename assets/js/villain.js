// Sir Croakwell, the toad wizard who frames the board from below (docs/VILLAIN_SPEC.md).
// He is four inline back-view sprites swapped in and out of one host element, the same way
// setGnome swaps the gnome: a fresh inline copy per pose, so every pose plays from its start.
import { preloadSprites, sprite } from './sprites.js';

export const VILLAIN_SPRITES = ['toad-back-idle', 'toad-back-cast', 'toad-back-gloat', 'toad-back-sulk'];
export const CAST_MS = 600;
const MOODS = ['idle', 'gloat', 'sulk'];

/**
 * Put Sir Croakwell in `host`. Resolves to `{ setMood(mood), cast() }` once the four sprites are loaded.
 * `setMood('idle' | 'gloat' | 'sulk')` does nothing if he is already in that mood. `cast()` shows the
 * spell pose for 600ms and then returns to the current mood; a second cast restarts the timer.
 * With reduced motion the poses still swap (the sprites hold still, see the CSS in each file).
 */
export async function mountVillain(host) {
  await preloadSprites(VILLAIN_SPRITES);
  let mood = 'idle';
  let shown = null;
  let timer = 0;

  function show(name) {
    if (shown && shown.dataset.sprite === name) return;
    const next = sprite(name, 'villain-sprite');
    if (shown) shown.replaceWith(next); else host.appendChild(next);
    shown = next;
    host.dataset.pose = name.replace('toad-back-', '');
  }
  show('toad-back-idle');

  return {
    setMood(next) {
      if (!MOODS.includes(next)) return;
      mood = next;
      if (!timer) show(`toad-back-${mood}`); // a cast in progress ends in the new mood
    },
    cast() {
      show('toad-back-cast');
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = 0;
        show(`toad-back-${mood}`);
      }, CAST_MS);
    },
  };
}
