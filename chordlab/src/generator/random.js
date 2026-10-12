/**
 * Small seeded random-number helpers so progressions are reproducible in tests.
 */

/** Mulberry32 PRNG: returns a function producing floats in [0, 1). */
export function createRng(seed = Date.now()) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a key from a { key: weight } map. Returns null if all weights are 0. */
export function weightedPick(weights, rng) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (!total) return null;
  let r = rng() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r < 0) return k;
  }
  return entries[entries.length - 1][0];
}

/** Pick a random element of an array. */
export const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

/** True with probability p. */
export const chance = (p, rng) => rng() < p;

/** Random 32-bit seed. */
export const randomSeed = () => Math.floor(Math.random() * 2 ** 32);
