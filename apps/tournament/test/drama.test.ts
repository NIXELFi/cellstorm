import { describe, it, expect } from "vitest";
import type { DramaReport } from "@cellstorm/score";
import { betterDrama } from "../src/drama";

const dr = (passed: boolean, score: number): DramaReport => ({
  passed,
  score,
  breakdown: {},
  reasons: passed ? [] : ["gate"],
});

describe("betterDrama", () => {
  it("prefers a passed report over a failed one regardless of score", () => {
    expect(betterDrama(dr(true, 0.1), dr(false, 99))).toBe(true);
    expect(betterDrama(dr(false, 99), dr(true, 0.1))).toBe(false);
  });

  it("among the same passed status, prefers the higher score", () => {
    expect(betterDrama(dr(true, 5), dr(true, 4))).toBe(true);
    expect(betterDrama(dr(true, 4), dr(true, 5))).toBe(false);
  });

  it("ties keep the incumbent (returns false)", () => {
    expect(betterDrama(dr(true, 5), dr(true, 5))).toBe(false);
  });
});
