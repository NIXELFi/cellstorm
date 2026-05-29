import { describe, it, expect } from "vitest";
import { canonicalDims } from "../src/dims";

describe("canonicalDims", () => {
  it("is full 4K at scale 1 / ss 1", () => {
    expect(canonicalDims({ scale: 1, supersample: 1 })).toEqual({
      width: 2160,
      height: 3840,
      renderWidth: 2160,
      renderHeight: 3840,
    });
  });

  it("halves to 1080x1920 at scale 0.5", () => {
    const d = canonicalDims({ scale: 0.5, supersample: 1 });
    expect(d.width).toBe(1080);
    expect(d.height).toBe(1920);
  });

  it("supersample multiplies render dims but keeps output dims", () => {
    const d = canonicalDims({ scale: 0.5, supersample: 2 });
    expect(d.width).toBe(1080);
    expect(d.height).toBe(1920);
    expect(d.renderWidth).toBe(2160);
    expect(d.renderHeight).toBe(3840);
  });

  it("produces even, 9:16 dims at odd scales", () => {
    const d = canonicalDims({ scale: 0.137, supersample: 1 });
    expect(d.width % 2).toBe(0);
    expect(d.height % 2).toBe(0);
    expect(d.height / d.width).toBeCloseTo(MASTER_RATIO, 1);
  });
});

const MASTER_RATIO = 3840 / 2160;
