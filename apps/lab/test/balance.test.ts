import { describe, it, expect } from "vitest";
import { balanceReport } from "../src/balance";

describe("balanceReport", () => {
  it("returns one stat per power with rates in [0,1]", () => {
    const powers = ["Tank", "Glasshammer", "Plague", "Swift"];
    const stats = balanceReport({ powers, teamCount: 2, seeds: 6 });
    expect(stats).toHaveLength(powers.length);
    expect(new Set(stats.map((s) => s.power))).toEqual(new Set(powers));
    for (const s of stats) {
      expect(s.winRate).toBeGreaterThanOrEqual(0);
      expect(s.winRate).toBeLessThanOrEqual(1);
      expect(s.stalemateRate).toBeGreaterThanOrEqual(0);
      expect(s.stalemateRate).toBeLessThanOrEqual(1);
      expect(s.avgDurationTicks).toBeGreaterThanOrEqual(0);
    }
  });

  it("is deterministic across runs", () => {
    const opts = { powers: ["Tank", "Glasshammer", "Plague", "Swift"], teamCount: 2, seeds: 5 };
    expect(balanceReport(opts)).toEqual(balanceReport(opts));
  });
});
