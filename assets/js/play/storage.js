// Progress: best stars per level id, under one localStorage key.
// Storage can be missing or throw (private windows, blocked cookies), so every
// access is wrapped and the game keeps working from memory.
const KEY = 'invisible-maze:progress:v1';
const best = {}; // level id -> 1..3

function clean(n) {
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n : 0;
}

export function loadProgress() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved.best !== 'object' || saved.best === null) return;
    for (const [id, n] of Object.entries(saved.best)) {
      if (clean(n) > (best[id] || 0)) best[id] = clean(n);
    }
  } catch {
    // Unavailable or corrupt: start from what we have in memory.
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, best }));
  } catch {
    // Not saved. The session still works.
  }
}

export function bestStars(id) {
  return best[id] || 0;
}

/** Keeps the higher of the old and new score. Returns the stored best. */
export function recordWin(id, stars) {
  if (clean(stars) > (best[id] || 0)) {
    best[id] = clean(stars);
    persist();
  }
  return best[id] || 0;
}

/* ---------- hints ----------
 * Inventory of hints: starts at 3, +1 the first time each daily date is finished (any stars),
 * capped at 10. Same pattern as progress: every storage access is wrapped, memory is the fallback. */
const HINT_KEY = 'invisible-maze:hints:v1';
export const HINTS_START = 3;
export const HINTS_MAX = 10;
const hints = { count: HINTS_START, earned: [] }; // earned: daily dates that already paid out

const cleanCount = (n) => (Number.isInteger(n) && n >= 0 ? Math.min(n, HINTS_MAX) : null);
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

export function loadHints() {
  try {
    const raw = window.localStorage.getItem(HINT_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return;
    const c = cleanCount(saved.count);
    if (c !== null) hints.count = c;
    if (Array.isArray(saved.earned)) hints.earned = [...new Set(saved.earned.filter(isDate))];
  } catch {
    // Unavailable or corrupt: keep the in-memory inventory.
  }
}

function persistHints() {
  try {
    window.localStorage.setItem(HINT_KEY, JSON.stringify({ v: 1, count: hints.count, earned: hints.earned }));
  } catch {
    // Not saved. The session still works.
  }
}

export function hintCount() {
  return hints.count;
}

/** Spend one hint. Returns false (and spends nothing) at 0. */
export function spendHint() {
  if (hints.count <= 0) return false;
  hints.count--;
  persistHints();
  return true;
}

/**
 * A daily date was finished. The first time for each date adds 1 hint (up to the cap of 10) and
 * returns true; any later call for that date returns false.
 */
export function earnDailyHint(date) {
  if (!isDate(date) || hints.earned.includes(date)) return false;
  hints.earned.push(date);
  const before = hints.count;
  hints.count = Math.min(HINTS_MAX, hints.count + 1);
  persistHints();
  return hints.count > before;
}
