// Small seeded PRNG (mulberry32) with helpers. Same seed, same sequence, always.

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed may be a number or a string. */
export function createRng(seed) {
  const s = typeof seed === 'string' ? hashString(seed) : Math.floor(Number(seed)) >>> 0;
  const raw = mulberry32(s);
  const rng = {
    /** float in [0, 1) */
    next: raw,
    /** integer in [lo, hi], inclusive */
    int(lo, hi) {
      return lo + Math.floor(raw() * (hi - lo + 1));
    },
    pick(arr) {
      return arr[Math.floor(raw() * arr.length)];
    },
    chance(p) {
      return raw() < p;
    },
    /** Fisher-Yates on a copy */
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(raw() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
  return rng;
}
