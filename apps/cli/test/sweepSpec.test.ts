import { describe, it, expect } from "vitest";
import { expand } from "../src/sweepSpec";

describe("expand", () => {
  it("pins powers + teamCount, sweeps seeds", () => {
    const cfgs = expand({
      teamCount: 2, powers: { mode: "fixed", names: ["Tank", "Plague"] },
      seeds: { from: 0, to: 9 }, limit: 100,
    });
    expect(cfgs).toHaveLength(10);
    expect(cfgs.every((c) => c.powers.join() === "Tank,Plague")).toBe(true);
  });
  it("random mode produces distinct power sets across seeds deterministically", () => {
    const cfgs = expand({ teamCount: 3, powers: { mode: "random" }, seeds: { from: 0, to: 4 } });
    expect(cfgs).toHaveLength(5);
    cfgs.forEach((c) => expect(c.powers).toHaveLength(3));
  });
  it("respects limit", () => {
    const cfgs = expand({ teamCount: 2, powers: { mode: "random" }, seeds: { from: 0, to: 999 }, limit: 50 });
    expect(cfgs).toHaveLength(50);
  });
});
