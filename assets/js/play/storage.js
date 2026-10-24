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
