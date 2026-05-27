/** Deterministic mulberry32 PRNG. Returns a function producing floats in [0,1). */
export type Prng = () => number;
export declare function makePrng(seed: number): Prng;
/** Integer in [0, n). */
export declare function randInt(prng: Prng, n: number): number;
/** Fisher-Yates shuffle in place using prng; returns the same array. */
export declare function shuffle<T>(prng: Prng, arr: T[]): T[];
