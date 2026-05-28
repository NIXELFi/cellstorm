import { describe, it, expect } from "vitest";
import type { BattleLog } from "@cellstorm/sim";
import {
  peakActionTick,
  peakActionWindows,
  buildOpeningSequence,
  DEFAULT_OPENING,
} from "../src/opening";

// Minimal BattleLog factory — only the fields the opening logic reads (events + durationTicks).
function log(durationTicks: number, events: Array<{ type: string; tick: number }>): BattleLog {
  return {
    config: {} as never,
    events: events as never,
    timeline: [],
    durationTicks,
    totalTicks: durationTicks,
    winner: 0,
  } as BattleLog;
}

// N deaths all on one tick (a tight burst).
function burst(tick: number, n: number): Array<{ type: string; tick: number }> {
  return Array.from({ length: n }, () => ({ type: "death", tick }));
}

// Three escalating bursts, all inside the back 60% of a 1000-tick fight.
const escalating = log(1000, [...burst(450, 8), ...burst(650, 12), ...burst(880, 20)]);

describe("peakActionTick", () => {
  it("finds the densest weighted window in the back portion", () => {
    const events = [
      { type: "death", tick: 50 }, { type: "death", tick: 52 },
      ...Array.from({ length: 12 }, (_, i) => ({ type: "death", tick: 800 + i })),
    ];
    const start = peakActionTick(log(1000, events), 30, 0.6);
    expect(start).toBeGreaterThanOrEqual(771);
    expect(start).toBeLessThanOrEqual(800);
  });

  it("ignores an early cluster outside the back-fraction search region", () => {
    const events = Array.from({ length: 20 }, (_, i) => ({ type: "death", tick: 100 + i }));
    expect(peakActionTick(log(1000, events), 30, 0.6)).toBeGreaterThanOrEqual(400);
  });

  it("falls back to ~70% when there is no scored activity", () => {
    expect(peakActionTick(log(1000, [{ type: "leadChange", tick: 500 }]), 30, 0.6)).toBe(700);
  });
});

describe("peakActionWindows", () => {
  it("picks one densest window per time band, spread across the fight, densest first", () => {
    const w = peakActionWindows(escalating, 6, 3, 0.6);
    expect(w).toEqual([875, 645, 445]); // descending intensity: 20-burst, 12-burst, 8-burst
    // windows are well separated in time (distinct phases), not adjacent moments
    for (let i = 0; i < w.length; i++)
      for (let j = i + 1; j < w.length; j++) expect(Math.abs(w[i]! - w[j]!)).toBeGreaterThanOrEqual(50);
  });

  it("drops low-action bands so the montage never cuts to a lull", () => {
    const w = peakActionWindows(log(1000, burst(880, 20)), 6, 3, 0.6);
    expect(w).toHaveLength(1); // only one band has real action; the two quiet bands are dropped
  });

  it("falls back to a single late window with no activity", () => {
    expect(peakActionWindows(log(1000, []), 6, 3, 0.6)).toEqual([700]);
  });
});

describe("buildOpeningSequence", () => {
  const cfg = { ...DEFAULT_OPENING, clipMs: 100, fps: 60, cuts: 3 }; // clipFrames = 6

  it("builds an escalating multi-cut montage, then the full battle from 0", () => {
    const total = 1080;
    const seq = buildOpeningSequence(escalating, total, cfg);
    expect(seq.cutAt).toBe(18); // 3 clips x 6 frames
    expect(seq.cutPoints).toEqual([0, 6, 12, 18]); // a hard cut at each clip start + the cut to t=0
    // first clip = smallest burst (tick 450); last clip = biggest burst (tick 880) → escalating
    expect(seq.order.slice(0, 6)).toEqual([445, 446, 447, 448, 449, 450]);
    expect(seq.order.slice(12, 18)).toEqual([875, 876, 877, 878, 879, 880]);
    // all teaser frames are within the fight (never the outro / winner card)
    for (let i = 0; i < seq.cutAt; i++) expect(seq.order[i]!).toBeLessThan(1000);
    // after the cut: a clean 0..total-1 run
    expect(seq.order.slice(seq.cutAt)).toEqual(Array.from({ length: total }, (_, i) => i));
  });

  it("uses as many clips as there are distinct peaks (graceful when fewer)", () => {
    const seq = buildOpeningSequence(log(1000, burst(880, 20)), 1080, cfg);
    expect(seq.cutAt).toBe(6); // only one distinct peak -> one clip
    expect(seq.cutPoints).toEqual([0, 6]);
  });

  it("disables the teaser when off (identity order, no cut points)", () => {
    const seq = buildOpeningSequence(escalating, 1000, { ...cfg, enabled: false });
    expect(seq.cutAt).toBe(0);
    expect(seq.cutPoints).toEqual([]);
    expect(seq.order).toEqual(Array.from({ length: 1000 }, (_, i) => i));
  });

  it("skips the teaser for very short fights", () => {
    const seq = buildOpeningSequence(log(15, burst(10, 5)), 15, cfg);
    expect(seq.cutAt).toBe(0);
  });

  it("clamps teaser clips to the captured frame count", () => {
    const seq = buildOpeningSequence(escalating, 460, cfg); // fewer captured frames than the fight
    for (let i = 0; i < seq.cutAt; i++) expect(seq.order[i]!).toBeLessThan(460);
  });
});
