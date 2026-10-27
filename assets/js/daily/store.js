// The daily's saved state under one localStorage key. Storage can be missing or throw (private
// windows, blocked cookies), so every access is wrapped and memory is the fallback.
// Two tabs can share the key, so every write first re-reads storage and merges (see mergeSaved)
// and the `storage` event brings the other tab's changes in.
import { STORAGE_KEY } from './config.js';
import { parseSaved, serialize, cleanDay, mergeSaved } from './record.js';

let state = { seenHowTo: false, days: {} };
const listeners = [];

/** What storage holds now, or null if it can't be read. */
function readStored() {
  try {
    return parseSaved(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Fold whatever storage holds into memory. Never loses anything memory already has. */
export function refresh() {
  const stored = readStored();
  if (stored) state = mergeSaved(stored, state);
}

export function loadStore() {
  const stored = readStored();
  if (stored) state = stored;
}

function persist() {
  refresh(); // re-read and merge before every write
  try {
    window.localStorage.setItem(STORAGE_KEY, serialize(state));
  } catch {
    // Not saved. The session still works.
  }
}

/** A copy of the saved day, or null if the date has no record. */
export function getDay(date) {
  return state.days[date] ? cleanDay(state.days[date]) : null;
}

export function saveDay(date, day) {
  state = mergeSaved(state, { seenHowTo: false, days: { [date]: cleanDay(day) } });
  persist();
}

export const allDays = () => state.days;
export const seenHowTo = () => state.seenHowTo;

export function markSeenHowTo() {
  if (state.seenHowTo) return;
  state.seenHowTo = true;
  persist();
}

/** Call `fn` when another tab changes the saved state (after memory has been brought up to date). */
export function onExternalChange(fn) {
  listeners.push(fn);
}

try {
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== STORAGE_KEY) return;
    refresh();
    for (const fn of listeners) fn();
  });
} catch {
  // No window events: single tab only.
}
