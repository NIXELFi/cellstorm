export function makePrng(seed) {
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
export function randInt(prng, n) {
    return Math.floor(prng() * n);
}
/** Fisher-Yates shuffle in place using prng; returns the same array. */
export function shuffle(prng, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = randInt(prng, i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
