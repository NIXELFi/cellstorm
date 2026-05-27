import { describe, it, expect } from "vitest";
import { makePrng } from "../src/prng";
describe("makePrng", () => {
    it("is deterministic for a given seed", () => {
        const a = makePrng(12345);
        const b = makePrng(12345);
        const seqA = [a(), a(), a(), a()];
        const seqB = [b(), b(), b(), b()];
        expect(seqA).toEqual(seqB);
    });
    it("returns floats in [0,1)", () => {
        const r = makePrng(1);
        for (let i = 0; i < 1000; i++) {
            const v = r();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
    it("differs across seeds", () => {
        expect(makePrng(1)()).not.toEqual(makePrng(2)());
    });
});
