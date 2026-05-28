import { describe, it, expect } from "vitest";
import type { BattleLog } from "@cellstorm/sim";
import { climaxTick, sparklineData } from "../src/ui/logLogic";

function log(partial: Partial<BattleLog>): BattleLog {
  return {
    config: {} as never,
    events: [],
    timeline: [],
    durationTicks: 0,
    totalTicks: 0,
    winner: 0,
    ...partial,
  };
}

describe("climaxTick", () => {
  it("returns the densest death window's start tick in the final portion", () => {
    // duration 1000, finalFraction 0.4 -> cutoff 600. Cluster of deaths at tick ~900.
    const events = [
      { type: "death" as const, tick: 100, cellId: 1, x: 0, y: 0, team: 0 },
      { type: "death" as const, tick: 650, cellId: 2, x: 0, y: 0, team: 0 },
      { type: "death" as const, tick: 900, cellId: 3, x: 0, y: 0, team: 0 },
      { type: "death" as const, tick: 910, cellId: 4, x: 0, y: 0, team: 1 },
      { type: "death" as const, tick: 940, cellId: 5, x: 0, y: 0, team: 1 },
    ];
    const tick = climaxTick(log({ durationTicks: 1000, events }), 0.4, 60);
    // window size 60 -> ticks 900/910/940 land in bucket 15 (900..959), the densest.
    expect(tick).toBe(900);
  });

  it("falls back to ~80% duration with no deaths", () => {
    expect(climaxTick(log({ durationTicks: 1000, events: [] }))).toBe(800);
  });

  it("returns 0 for an empty battle", () => {
    expect(climaxTick(log({ durationTicks: 0 }))).toBe(0);
  });
});

describe("sparklineData", () => {
  it("produces one series per team and the global max", () => {
    const timeline = [
      { tick: 0, counts: [10, 8] },
      { tick: 6, counts: [9, 9] },
      { tick: 12, counts: [5, 9] },
      { tick: 18, counts: [0, 7] },
    ];
    const d = sparklineData(log({ timeline }), 120);
    expect(d.series).toHaveLength(2);
    expect(d.series[0]).toEqual([10, 9, 5, 0]);
    expect(d.series[1]).toEqual([8, 9, 9, 7]);
    expect(d.max).toBe(10);
    expect(d.length).toBe(4);
  });

  it("subsamples to maxPoints and keeps the exact finish", () => {
    const timeline = Array.from({ length: 500 }, (_, i) => ({
      tick: i,
      counts: [500 - i, i],
    }));
    const d = sparklineData(log({ timeline }), 50);
    expect(d.length).toBe(50);
    // last sample is the true finish
    expect(d.series[0]!.at(-1)).toBe(1);
    expect(d.series[1]!.at(-1)).toBe(499);
  });

  it("handles an empty timeline", () => {
    const d = sparklineData(log({ timeline: [] }));
    expect(d).toEqual({ series: [], max: 0, length: 0 });
  });
});
