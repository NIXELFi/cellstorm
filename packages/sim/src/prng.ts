/** Deterministic mulberry32 PRNG. Returns a function producing floats in [0,1). */
export type Prng = () => number;

export function makePrng(seed: number): Prng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n). */
export function randInt(prng: Prng, n: number): number {
  return Math.floor(prng() * n);
}

/** Fisher-Yates shuffle in place using prng; returns the same array. */
export function shuffle<T>(prng: Prng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(prng, i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
