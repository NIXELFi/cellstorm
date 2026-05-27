import { describe, it, expect } from "vitest";
import { score } from "../src/index";
import { DEFAULT_PROFILE } from "../src/types";
import type { BattleLog } from "@cellstorm/sim";

function log(partial: Partial<BattleLog>): BattleLog {
  return { config: {} as any, events: [], timeline: [], durationTicks: 0, winner: 0, ...partial };
}

describe("score gates", () => {
  it("fails a stalemate (winner -1)", () => {
    const r = score(log({ winner: -1, durationTicks: 60 * 40 }), DEFAULT_PROFILE);
    expect(r.passed).toBe(false);
    expect(r.reasons.join()).toMatch(/winner/i);
  });
  it("fails too-short battles", () => {
    const r = score(log({ winner: 0, durationTicks: 60 * 5,
      timeline: [{ tick: 0, counts: [10, 10] }, { tick: 300, counts: [10, 0] }] }), DEFAULT_PROFILE);
    expect(r.passed).toBe(false);
  });
  it("passes a clean 40s single-winner battle", () => {
    const tl = [];
    for (let i = 0; i <= 40; i++) tl.push({ tick: i * 60, counts: [Math.max(0, 20 - i), Math.max(0, i - 5)] });
    const r = score(log({ winner: 1, durationTicks: 60 * 40, timeline: tl }), DEFAULT_PROFILE);
    expect(r.passed).toBe(true);
    expect(r.score).toBeGreaterThan(0);
  });
});
