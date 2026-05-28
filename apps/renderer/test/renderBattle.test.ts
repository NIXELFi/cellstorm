import { describe, it, expect } from "vitest";
import { frameFileName, MASTER_WIDTH, MASTER_HEIGHT } from "../src/renderBattle";

describe("frameFileName", () => {
  it("zero-pads to 6 digits, 0-based", () => {
    expect(frameFileName(0)).toBe("000000.png");
    expect(frameFileName(1)).toBe("000001.png");
    expect(frameFileName(123)).toBe("000123.png");
    expect(frameFileName(999999)).toBe("999999.png");
  });

  it("sorts lexicographically in capture order", () => {
    const names = [10, 2, 1, 100, 0].map(frameFileName);
    const sorted = [...names].sort();
    expect(sorted).toEqual([0, 1, 2, 10, 100].map(frameFileName));
  });
});

describe("master resolution", () => {
  it("is the 9:16 4K master", () => {
    expect(MASTER_WIDTH).toBe(2160);
    expect(MASTER_HEIGHT).toBe(3840);
    expect(MASTER_HEIGHT / MASTER_WIDTH).toBeCloseTo(16 / 9, 5);
  });
});
