// The daily's saved state under one localStorage key. Storage can be missing or throw (private
// windows, blocked cookies), so every access is wrapped and memory is the fallback.
// Two tabs can share the key, so every write first re-reads storage and merges (see mergeSaved)
// and the `storage` event brings the other tab's changes in.
import { STORAGE_KEY, V1_KEY } from './config.js';
import { emptySaved, parseSaved, serialize, cleanDay, mergeSaved, migrateV1 } from './record.js';

let state = emptySaved();
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

/** The v1 text still waiting to be carried over: only while there is no v2 save yet. Null otherwise. */
export function pendingV1() {
  try {
    if (window.localStorage.getItem(STORAGE_KEY) !== null) return null;
    return window.localStorage.getItem(V1_KEY);
  } catch {
    return null;
  }
}

/** Carry the v1 records into Hard (see migrateV1) and save. `parOf(date)` is the Hard level's par for a date. */
export function adoptV1(raw, parOf) {
  const migrated = migrateV1(raw, parOf);
  if (migrated) state = mergeSaved(state, migrated);
  persist();
}

/** A copy of the saved day, or null if the date has no record. */
export function getDay(mode, date) {
  return state[mode][date] ? cleanDay(state[mode][date]) : null;
}

export function saveDay(mode, date, day) {
  state = mergeSaved(state, { ...emptySaved(), lastMode: null, [mode]: { [date]: cleanDay(day) } });
  persist();
}

/** Both modes' days: { easy: { date: record }, hard: { date: record } }. */
export const allDays = () => ({ easy: state.easy, hard: state.hard });
export const seenHowTo = () => state.seenHowTo;
export const lastMode = () => state.lastMode;

export function setLastMode(mode) {
  if (state.lastMode === mode) return;
  state.lastMode = mode;
  persist();
}

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
