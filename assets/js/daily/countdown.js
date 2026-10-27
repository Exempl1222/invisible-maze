// How long until the next daily: local midnight. Pure, no timers. No DOM.
import { localDateString } from '../play/daily.js';

const MINUTE = 60000;

/**
 * The countdown line for `now` (a Date), for a page loaded on local date `loadedDate`. Partial
 * minutes round up. Once the local date is no longer `loadedDate`, a new gnome is here.
 */
export function nextGnome(now, loadedDate) {
  if (localDateString(now) !== loadedDate) {
    return { newDay: true, hours: 0, minutes: 0, text: 'A new gnome is here' };
  }
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const total = Math.max(1, Math.ceil((midnight - now) / MINUTE));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return { newDay: false, hours, minutes, text: `Next gnome in ${hours > 0 ? `${hours}h ` : ''}${minutes}m` };
}

/** Milliseconds until the clock's next whole minute (60000 exactly on the minute), to update on the dot. */
export function msToNextMinute(now) {
  return MINUTE - (now.getTime() % MINUTE);
}
