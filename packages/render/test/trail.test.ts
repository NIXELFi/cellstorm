import { describe, it, expect } from "vitest";
import { trailQuads, TRAIL_TUNING } from "../src/trail";

// Geometry helpers for assertions: a quad is [nLx,nLy, nRx,nRy, fRx,fRy, fLx,fLy].
function near(q: number[]): { x: number; y: number } {
  return { x: (q[0]! + q[2]!) / 2, y: (q[1]! + q[3]!) / 2 };
}
function far(q: number[]): { x: number; y: number } {
  return { x: (q[4]! + q[6]!) / 2, y: (q[5]! + q[7]!) / 2 };
}
function width(p: number[], a: number, b: number): number {
  return Math.hypot(p[a]! - p[a + 2]!, p[b]! - p[b + 2]!);
}

describe("trailQuads", () => {
  it("returns null below minSpeed (incl. a fully stationary cell)", () => {
    expect(trailQuads(10, 10, 0, 0, 4, 1)).toBeNull();
    const justBelow = TRAIL_TUNING.minSpeed - 1e-6;
    expect(trailQuads(10, 10, justBelow, 0, 4, 1)).toBeNull();
  });

  it("returns a streak at and above minSpeed", () => {
    const r = trailQuads(10, 10, TRAIL_TUNING.minSpeed, 0, 4, 1);
    expect(r).not.toBeNull();
  });

  it("produces exactly `segments` quads, each 8 numbers", () => {
    const r = trailQuads(0, 0, 1, 0, 4, 1)!;
    expect(r.quads.length).toBe(TRAIL_TUNING.segments);
    expect(r.alphas.length).toBe(TRAIL_TUNING.segments);
    for (const q of r.quads) expect(q.length).toBe(8);
  });

  it("trail length grows with speed", () => {
    const slow = trailQuads(0, 0, 0.5, 0, 4, 1)!;
    const fast = trailQuads(0, 0, 1.5, 0, 4, 1)!;
    // Tail = far edge of the last segment; length is its distance from the head (cell center at 0,0).
    const slowTail = far(slow.quads[slow.quads.length - 1]!);
    const fastTail = far(fast.quads[fast.quads.length - 1]!);
    const slowLen = Math.hypot(slowTail.x, slowTail.y);
    const fastLen = Math.hypot(fastTail.x, fastTail.y);
    expect(fastLen).toBeGreaterThan(slowLen);
  });

  it("clamps length at maxLength", () => {
    // A very large speed must not exceed maxLength.
    const r = trailQuads(0, 0, 1000, 0, 4, 1)!;
    const tail = far(r.quads[r.quads.length - 1]!);
    const len = Math.hypot(tail.x, tail.y);
    expect(len).toBeCloseTo(TRAIL_TUNING.maxLength, 6);
    // And it actually reaches the clamp (not less).
    expect(len).toBeGreaterThanOrEqual(TRAIL_TUNING.maxLength - 1e-6);
  });

  it("points opposite the velocity", () => {
    // Moving +x: the trail tail must be at -x relative to the head.
    const r = trailQuads(0, 0, 2, 0, 4, 1)!;
    const tail = far(r.quads[r.quads.length - 1]!);
    expect(tail.x).toBeLessThan(0);
    expect(tail.y).toBeCloseTo(0, 6);
  });

  it("alpha fades head -> tail", () => {
    const r = trailQuads(0, 0, 1, 0, 4, 1)!;
    for (let k = 1; k < r.alphas.length; k++) {
      expect(r.alphas[k]!).toBeLessThan(r.alphas[k - 1]!);
    }
    // Head segment alpha equals the overall alpha (k=0 factor is 1).
    const speed = 1;
    const overall = Math.min(
      TRAIL_TUNING.maxAlpha,
      TRAIL_TUNING.baseAlpha + speed * TRAIL_TUNING.alphaSpeedScale,
    );
    expect(r.alphas[0]!).toBeCloseTo(overall, 6);
  });

  it("overall alpha rises with speed but is capped at maxAlpha", () => {
    const slow = trailQuads(0, 0, 0.5, 0, 4, 1)!;
    const fast = trailQuads(0, 0, 1.5, 0, 4, 1)!;
    expect(fast.alphas[0]!).toBeGreaterThan(slow.alphas[0]!);
    const huge = trailQuads(0, 0, 1000, 0, 4, 1)!;
    expect(huge.alphas[0]!).toBeCloseTo(TRAIL_TUNING.maxAlpha, 6);
  });

  it("tapers from full head width to a point at the tail", () => {
    // headWidth is used directly by the function (the caller applies headWidthFrac), so the near edge
    // of the first segment equals the supplied headWidth.
    const r = trailQuads(0, 0, 1, 0, 4, 1)!;
    const headW = width(r.quads[0]!, 0, 1); // near edge of first segment
    expect(headW).toBeCloseTo(4, 6);
    // Far edge of the last segment collapses to a point at the tail.
    const tailW = width(r.quads[r.quads.length - 1]!, 4, 5);
    expect(tailW).toBeCloseTo(0, 6);
    expect(headW).toBeGreaterThan(tailW);
  });

  it("applies scale to canvas space", () => {
    const a = trailQuads(0, 0, 2, 0, 4, 1)!;
    const b = trailQuads(0, 0, 2, 0, 4, 3)!;
    // Every coordinate of b should be 3x a (head at origin, so pure scaling).
    for (let k = 0; k < a.quads.length; k++) {
      for (let i = 0; i < 8; i++) {
        expect(b.quads[k]![i]!).toBeCloseTo(a.quads[k]![i]! * 3, 6);
      }
    }
  });
});
