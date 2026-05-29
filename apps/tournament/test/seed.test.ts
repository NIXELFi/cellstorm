import { describe, it, expect } from "vitest";
import { deriveSeed, selectEntrants, SALT_MATCH } from "../src/seed";

describe("deriveSeed", () => {
  it("is deterministic and position-sensitive", () => {
    expect(deriveSeed(7, SALT_MATCH, 0, 0)).toBe(deriveSeed(7, SALT_MATCH, 0, 0));
    expect(deriveSeed(7, SALT_MATCH, 0, 0)).not.toBe(deriveSeed(7, SALT_MATCH, 0, 1));
    expect(deriveSeed(7, SALT_MATCH, 0, 0)).not.toBe(deriveSeed(8, SALT_MATCH, 0, 0));
  });

  it("returns a uint32", () => {
    for (const s of [0, 1, 123, 99999]) {
      const v = deriveSeed(s, 4, 5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** 32);
    }
  });
});

describe("selectEntrants", () => {
  it("picks 16 distinct powers, stable per seed, varying across seeds", () => {
    const a = selectEntrants(42);
    const b = selectEntrants(42);
    const c = selectEntrants(43);
    expect(a).toHaveLength(16);
    expect(new Set(a).size).toBe(16);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
