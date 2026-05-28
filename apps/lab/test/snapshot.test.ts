import { describe, it, expect } from "vitest";
import { snapshot, configId } from "../src/snapshot";

describe("snapshot", () => {
  it("is stable across runs", () => {
    const cfgs = [{ seed: 1, teamCount: 2, powers: ["Tank", "Plague"] }];
    expect(snapshot(cfgs as any)).toEqual(snapshot(cfgs as any));
  });

  it("emits a stable configId, winner and durationTicks per config", () => {
    const cfgs = [
      { seed: 1, teamCount: 2, powers: ["Tank", "Plague"] },
      { seed: 2, teamCount: 2, powers: ["Glasshammer", "Swift"] },
    ];
    const out = snapshot(cfgs as any);
    expect(out[0]!.configId).toBe(configId({ teamCount: 2, powers: ["Tank", "Plague"], seed: 1 }));
    expect(out[0]).toHaveProperty("winner");
    expect(out[0]).toHaveProperty("durationTicks");
    expect(out[0]!.durationTicks).toBeGreaterThan(0);
  });
});
