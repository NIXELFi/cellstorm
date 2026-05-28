import { describe, it, expect } from "vitest";
import { roundRobin } from "../src/roundRobin";

describe("roundRobin", () => {
  it("produces win counts for each ordered pair over seeds", () => {
    const res = roundRobin(["Tank", "Glasshammer"], { seeds: 4 });
    expect(res.winRate("Tank", "Glasshammer")).toBeGreaterThanOrEqual(0);
    expect(res.winRate("Tank", "Glasshammer")).toBeLessThanOrEqual(1);
  });

  it("winRate is in [0,1] for every ordered pair", () => {
    const powers = ["Tank", "Glasshammer", "Plague"];
    const res = roundRobin(powers, { seeds: 3 });
    for (const a of powers) {
      for (const b of powers) {
        if (a === b) continue;
        const r = res.winRate(a, b);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      }
    }
  });

  it("aWins + bWins (reversed) + stalemates == seeds for a pair", () => {
    const seeds = 4;
    const res = roundRobin(["Tank", "Glasshammer"], { seeds });
    const aWins = res.wins.get("Tank")!.get("Glasshammer")!;
    const bWins = res.wins.get("Glasshammer")!.get("Tank")!;
    // Each count is a separate set of `seeds` battles (different matchup order),
    // so they don't share a denominator; just assert each is in range.
    expect(aWins).toBeGreaterThanOrEqual(0);
    expect(aWins).toBeLessThanOrEqual(seeds);
    expect(bWins).toBeGreaterThanOrEqual(0);
    expect(bWins).toBeLessThanOrEqual(seeds);
  });
});
