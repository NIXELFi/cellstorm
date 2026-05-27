import { describe, it, expect } from "vitest";
import {
  DEFAULT_FORM,
  buildSweepSpec,
  buildPowerAssignment,
  estimateRuns,
  type SweepFormState,
} from "../src/ui/sweepLogic";

function form(overrides: Partial<SweepFormState>): SweepFormState {
  return { ...DEFAULT_FORM, ...overrides };
}

describe("buildSweepSpec", () => {
  it("pins team count and uses random powers by default", () => {
    const spec = buildSweepSpec(form({ teamCountMode: "pin", teamCountPin: 3, powerMode: "random" }));
    expect(spec.teamCount).toBe(3);
    expect(spec.powers).toEqual({ mode: "random" });
    expect(spec.seeds).toEqual({ from: 0, to: 199 });
  });

  it("sweeps a team count list", () => {
    const spec = buildSweepSpec(form({ teamCountMode: "sweep", teamCountList: [2, 4] }));
    expect(spec.teamCount).toEqual([2, 4]);
  });

  it("builds fixed powers and validates count == teamCount", () => {
    const ok = buildSweepSpec(
      form({ teamCountMode: "pin", teamCountPin: 2, powerMode: "fixed", fixedNames: ["Tank", "Plague"] }),
    );
    expect(ok.powers).toEqual({ mode: "fixed", names: ["Tank", "Plague"] });
    expect(() =>
      buildSweepSpec(form({ teamCountMode: "pin", teamCountPin: 3, powerMode: "fixed", fixedNames: ["Tank"] })),
    ).toThrow(/needs exactly 3/);
  });

  it("builds pool powers and rejects an empty pool", () => {
    expect(buildPowerAssignment(form({ powerMode: "pool", poolNames: ["Tank", "Swift"] }))).toEqual({
      mode: "pool",
      pool: ["Tank", "Swift"],
    });
    expect(() => buildSweepSpec(form({ powerMode: "pool", poolNames: [] }))).toThrow(/pool/);
  });

  it("rejects an inverted seed range and empty sweep list", () => {
    expect(() => buildSweepSpec(form({ seedFrom: 10, seedTo: 5 }))).toThrow(/to.*from/i);
    expect(() => buildSweepSpec(form({ teamCountMode: "sweep", teamCountList: [] }))).toThrow();
  });

  it("threads limit and totalCells through", () => {
    const spec = buildSweepSpec(form({ limit: 50, totalCells: 600 }));
    expect(spec.limit).toBe(50);
    expect(spec.totalCells).toBe(600);
  });
});

describe("estimateRuns", () => {
  it("multiplies seed count by team-count axis and caps at limit", () => {
    expect(estimateRuns(form({ seedFrom: 0, seedTo: 9, teamCountMode: "pin" }))).toBe(10);
    expect(
      estimateRuns(form({ seedFrom: 0, seedTo: 9, teamCountMode: "sweep", teamCountList: [2, 3, 4] })),
    ).toBe(30);
    expect(estimateRuns(form({ seedFrom: 0, seedTo: 999, limit: 50 }))).toBe(50);
  });
});
