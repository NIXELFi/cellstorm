import { describe, it, expect } from "vitest";
import type { BattleSummary } from "@cellstorm/sim";
import type { ScoreProfile } from "@cellstorm/score";
import type { ChosenBattle } from "../src/types";
import { betterBattle } from "../src/simulateBracket";

const PROFILE: ScoreProfile = {
  targetMinSec: 15,
  targetMaxSec: 40,
  fps: 60,
  maxStalemateSec: 8,
  weights: { leadVolatility: 1, comeback: 1.5, climaxTiming: 1, closeFinish: 1, sustainedChaos: 0.5 },
};

function cb(o: { seed?: number; passed: boolean; score?: number; resolved: boolean; durTicks: number }): ChosenBattle {
  const summary: BattleSummary = {
    winner: 0,
    durationTicks: o.durTicks,
    totalTicks: o.durTicks + 108,
    survivors: 5,
    resolved: o.resolved,
  };
  return {
    seed: o.seed ?? 1,
    powers: ["A", "B"],
    winnerTeam: 0,
    winner: "A",
    drama: { passed: o.passed, score: o.score ?? 0, breakdown: {}, reasons: [] },
    summary,
  };
}

describe("betterBattle", () => {
  it("ranks passed > resolved > unresolved (capped)", () => {
    const passed = cb({ passed: true, score: 3, resolved: true, durTicks: 1500 });
    const resolved = cb({ passed: false, resolved: true, durTicks: 1300 });
    const capped = cb({ passed: false, resolved: false, durTicks: 4500 });
    expect(betterBattle(passed, resolved, PROFILE)).toBe(true);
    expect(betterBattle(passed, capped, PROFILE)).toBe(true);
    expect(betterBattle(resolved, capped, PROFILE)).toBe(true);
    expect(betterBattle(capped, resolved, PROFILE)).toBe(false);
  });

  it("NEVER picks a capped fight over a resolved one (the core fix)", () => {
    const capped = cb({ passed: false, resolved: false, durTicks: 4500 }); // 75s, hit the cap
    const resolvedShort = cb({ passed: false, resolved: true, durTicks: 600 }); // 10s, too short to pass
    expect(betterBattle(capped, resolvedShort, PROFILE)).toBe(false);
    expect(betterBattle(resolvedShort, capped, PROFILE)).toBe(true);
  });

  it("among passed fights, prefers higher drama", () => {
    const a = cb({ passed: true, score: 5, resolved: true, durTicks: 1500 });
    const b = cb({ passed: true, score: 4, resolved: true, durTicks: 1500 });
    expect(betterBattle(a, b, PROFILE)).toBe(true);
  });

  it("among non-passed fights, prefers the one closest to the 15-40s window", () => {
    const justOver = cb({ passed: false, resolved: true, durTicks: 2460 }); // 41s
    const wayOver = cb({ passed: false, resolved: true, durTicks: 4200 }); // 70s
    expect(betterBattle(justOver, wayOver, PROFILE)).toBe(true);
  });
});
