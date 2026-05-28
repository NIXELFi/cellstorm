import { describe, test, expect } from "vitest";
import type { SimEvent } from "@cellstorm/sim";
import { impactFromEvents, decayImpact, winnerFlash, shakeOffset, aberrationPixels, ditherSeed } from "../src/postfxLogic";

describe("impactFromEvents", () => {
  test("explosions hit harder than deaths; quiet ticks add nothing", () => {
    const expl: SimEvent[] = [{ type: "explosion", tick: 5, x: 0, y: 0, team: 0 }];
    const death: SimEvent[] = [{ type: "death", tick: 5, cellId: 1, x: 0, y: 0, team: 0 }];
    expect(impactFromEvents(expl)).toBeGreaterThan(impactFromEvents(death));
    expect(impactFromEvents([{ type: "projectileFire", tick: 5, team: 0 }])).toBe(0);
    expect(impactFromEvents([])).toBe(0);
  });

  test("more simultaneous hits add more, but saturates at 1", () => {
    const many: SimEvent[] = Array.from({ length: 50 }, (_, i) => ({ type: "explosion", tick: 5, x: 0, y: 0, team: 0 } as SimEvent));
    const v = impactFromEvents(many);
    expect(v).toBeGreaterThan(impactFromEvents([{ type: "explosion", tick: 5, x: 0, y: 0, team: 0 }]));
    expect(v).toBeLessThanOrEqual(1);
  });
});

describe("decayImpact", () => {
  test("adds the new impulse and decays toward zero, clamped to [0,1]", () => {
    expect(decayImpact(0, 0.5, 0.85)).toBeCloseTo(0.5, 6); // 0*0.85 + 0.5
    expect(decayImpact(1, 0, 0.85)).toBeCloseTo(0.85, 6); // decays
    expect(decayImpact(0.9, 0.9, 0.85)).toBe(1); // clamped, not >1
    let v = 1;
    for (let i = 0; i < 100; i++) v = decayImpact(v, 0, 0.85);
    expect(v).toBeLessThan(0.001); // settles to silence
  });
});

describe("winnerFlash", () => {
  test("zero before the battle resolves", () => {
    expect(winnerFlash(100, -1, 60, 0.4)).toBe(0);
    expect(winnerFlash(100, 120, 60, 0.4)).toBe(0); // not yet resolved
  });
  test("peaks at the resolve frame then decays to zero over the window", () => {
    const at = winnerFlash(120, 120, 60, 0.4);
    const later = winnerFlash(132, 120, 60, 0.4); // 0.2s after
    expect(at).toBeCloseTo(1, 6);
    expect(later).toBeLessThan(at);
    expect(later).toBeGreaterThan(0);
    expect(winnerFlash(150, 120, 60, 0.4)).toBe(0); // past the 0.4s window
  });
});

describe("shakeOffset", () => {
  test("zero magnitude -> no offset; deterministic for a tick", () => {
    expect(shakeOffset(50, 0)).toEqual({ dx: 0, dy: 0 });
    expect(shakeOffset(50, 3)).toEqual(shakeOffset(50, 3));
  });
  test("offset magnitude is bounded by the requested magnitude", () => {
    for (let t = 0; t < 200; t++) {
      const { dx, dy } = shakeOffset(t, 5);
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(5 + 1e-9);
    }
  });
  test("different ticks generally give different offsets (it actually moves)", () => {
    const a = shakeOffset(10, 5);
    const b = shakeOffset(11, 5);
    expect(a.dx !== b.dx || a.dy !== b.dy).toBe(true);
  });
});

describe("aberrationPixels", () => {
  test("scales a base..max range with impact, clamped", () => {
    expect(aberrationPixels(0, 1, 4)).toBeCloseTo(1, 6);
    expect(aberrationPixels(1, 1, 4)).toBeCloseTo(4, 6);
    expect(aberrationPixels(0.5, 1, 4)).toBeCloseTo(2.5, 6);
    expect(aberrationPixels(2, 1, 4)).toBeCloseTo(4, 6); // clamped
  });
});

describe("ditherSeed", () => {
  test("always within [0,1)", () => {
    for (let f = 0; f < 1000; f++) {
      const s = ditherSeed(f);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(1);
    }
  });
  test("deterministic for a given frame", () => {
    expect(ditherSeed(42)).toBe(ditherSeed(42));
    expect(ditherSeed(0)).toBe(ditherSeed(0));
  });
  test("varies across frames (the grain actually advances)", () => {
    expect(ditherSeed(10)).not.toBe(ditherSeed(11));
    const seen = new Set<number>();
    for (let f = 0; f < 50; f++) seen.add(ditherSeed(f));
    expect(seen.size).toBe(50); // every frame a distinct seed
  });
});
