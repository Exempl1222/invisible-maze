// The daily's saved state under one localStorage key. Storage can be missing or throw (private
// windows, blocked cookies), so every access is wrapped and memory is the fallback.
import { STORAGE_KEY } from './config.js';
import { parseSaved, serialize, cleanDay } from './record.js';

let state = { seenHowTo: false, days: {} };

export function loadStore() {
  try {
    state = parseSaved(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Unavailable: start from memory.
  }
}

function persist() {
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
  state.days[date] = cleanDay(day);
  persist();
}

export const allDays = () => state.days;
export const seenHowTo = () => state.seenHowTo;

export function markSeenHowTo() {
  if (state.seenHowTo) return;
  state.seenHowTo = true;
  persist();
}
