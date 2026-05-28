import { describe, it, expect } from "vitest";
import { normalizeConfig, DEFAULTS } from "../src/config";

describe("normalizeConfig", () => {
  it("fills defaults", () => {
    const c = normalizeConfig({ seed: 5, teamCount: 3, powers: ["Tank", "Plague", "Sniper"] });
    expect(c.totalCells).toBe(DEFAULTS.totalCells);
    expect(c.arena.width).toBe(DEFAULTS.arena.width);
    expect(c.maxTicks).toBe(DEFAULTS.maxTicks);
  });
  it("rejects powers length != teamCount", () => {
    expect(() => normalizeConfig({ seed: 1, teamCount: 2, powers: ["Tank"] })).toThrow();
  });
  it("rejects totalCells too small for teamCount", () => {
    expect(() =>
      normalizeConfig({ seed: 1, teamCount: 6, powers: ["Tank", "Plague", "Sniper", "Swift", "Brute", "Bomb"], totalCells: 2 })
    ).toThrow(/totalCells too small/);
  });
});
