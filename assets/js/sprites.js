// Loads Gnome Sweet Gnome sprites once and hands out fresh inline copies.
//
// Why inline and not <img>: browsers share one animation clock per SVG image URL, so a second
// wall drawn with <img> would appear already built. An inline copy gets its own clock, so every
// wall plays its build when placed and the gnome's animation restarts on every state change.
// Static tiles and stumps don't need this and stay as CSS backgrounds (see assets/css/sprites.css).
//
// Every sprite's CSS is scoped to its root class (gsg-gnome, gsg-wall) and every id carries a
// per-file prefix, so inlining many sprites into one page is safe.

const BASE = new URL('../sprites/', import.meta.url);
const text = new Map();
const pending = new Map();

export const DIRS = ['up', 'right', 'down', 'left'];
export const STATES = ['idle', 'walk', 'shrug'];
export const GNOME_SPRITES = DIRS.flatMap((d) => STATES.map((s) => `gnome-${d}-${s}`));
export const WALL_SPRITES = ['wall-h', 'wall-v', 'wall-h-hint', 'wall-v-hint'];

/** Engine step letter (U R D L) to sprite direction. */
export const DIR_OF_STEP = { U: 'up', R: 'right', D: 'down', L: 'left' };

function load(name) {
  if (!pending.has(name)) {
    pending.set(name, fetch(new URL(`${name}.svg`, BASE)).then((r) => {
      if (!r.ok) throw new Error(`sprite ${name}.svg: HTTP ${r.status}`);
      return r.text();
    }).then((t) => { text.set(name, t); return t; }));
  }
  return pending.get(name);
}

/** Fetch these sprites (default: gnome and walls). Await it before the board first draws. */
export function preloadSprites(names = [...GNOME_SPRITES, ...WALL_SPRITES]) {
  return Promise.all(names.map(load));
}

/** A fresh inline copy of a preloaded sprite, wrapped in a span the caller positions with CSS. */
export function sprite(name, className = '') {
  const t = text.get(name);
  if (!t) throw new Error(`sprite ${name} was not preloaded`);
  const wrap = document.createElement('span');
  wrap.className = `sprite ${className}`.trim();
  wrap.dataset.sprite = name;
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = t;
  return wrap;
}

/**
 * Swap the gnome inside `host` to a direction and state. Does nothing if it is already showing
 * that sprite, so calling it every step is cheap and the walk cycle doesn't restart mid-stride.
 */
export function setGnome(host, dir, state) {
  const name = `gnome-${dir}-${state}`;
  const current = host.querySelector(':scope > .gnome-sprite');
  if (current && current.dataset.sprite === name) return current;
  const next = sprite(name, 'gnome-sprite');
  if (current) current.replaceWith(next); else host.appendChild(next);
  host.dataset.dir = dir;
  host.dataset.state = state;
  return next;
}

/**
 * Add a class that runs a one-shot CSS animation and resolve after `ms`. With `keep: true` the
 * class stays on, holding the last frame (the dive keeps the gnome hidden until the caller
 * moves him and starts the pop in the same frame).
 */
export function playOnce(el, cls, ms, { keep = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; if (!keep) el.classList.remove(cls); resolve(); };
    el.classList.remove(cls);
    void el.offsetWidth; // restart if it was just played
    el.classList.add(cls);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(finish, reduce ? 0 : ms);
  });
}
