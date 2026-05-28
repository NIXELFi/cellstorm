import { describe, it, expect } from "vitest";
import { scoreDiff } from "../src/scoreDiff";
import { DEFAULT_PROFILE, type ScoreProfile, type BattleLog } from "@cellstorm/score";
import { normalizeConfig } from "@cellstorm/sim";

/**
 * Build a log whose drama components evaluate to known values, sidestepping the
 * sim. We engineer the timeline + events so:
 *   comeback   = 1 - winner's min population share
 *   closeFinish= 1 - survivors/initialWinnerCount
 * and place all eliminations close together to clear gates.
 */
function log(winnerStart: number, winnerEnd: number, otherStart: number): BattleLog {
  const winner = 0;
  // 40s battle so it sits inside the default [30,60]s window.
  const durationTicks = 60 * 40;
  // Two timeline snapshots: start and end.
  const timeline = [
    { tick: 0, counts: [winnerStart, otherStart] },
    { tick: durationTicks, counts: [winnerEnd, 0] },
  ];
  // A death event every second so there's no dead-air gate failure.
  const events: BattleLog["events"] = [];
  for (let t = 60; t <= durationTicks; t += 60) {
    events.push({ type: "death", tick: t, cellId: t, x: 0, y: 0, team: 1 });
  }
  return {
    config: normalizeConfig({ seed: 0, teamCount: 2, powers: ["Tank", "Plague"], totalCells: 120, maxTicks: 9000 }),
    events,
    timeline,
    durationTicks,
    winner,
  };
}

describe("scoreDiff", () => {
  it("computes a correct ranking delta when profile weights flip the order", () => {
    // Log X: big comeback (winner once at tiny share), few survivors lost
    //   start [1, 100] -> minShare = 1/101 ~ 0.0099 -> comeback ~0.99
    //   initialWinnerCount=1, survivors=1 -> closeFinish = 0
    const X = log(1, 1, 100);
    // Log Y: no comeback (winner dominant), but a very close finish
    //   start [100, 1] -> minShare ~ 100/101 -> comeback ~0.0099
    //   initialWinnerCount=100, survivors=1 -> closeFinish ~0.99
    const Y = log(100, 1, 1);

    const profileA: ScoreProfile = {
      ...DEFAULT_PROFILE,
      weights: { leadVolatility: 0, comeback: 3, climaxTiming: 0, closeFinish: 0, sustainedChaos: 0 },
    };
    const profileB: ScoreProfile = {
      ...DEFAULT_PROFILE,
      weights: { leadVolatility: 0, comeback: 0, climaxTiming: 0, closeFinish: 3, sustainedChaos: 0 },
    };

    const rows = scoreDiff([X, Y], profileA, profileB);
    const rowX = rows[0]!;
    const rowY = rows[1]!;

    // Under A (comeback only): X wins.
    expect(rowX.passedA).toBe(true);
    expect(rowX.rankA).toBe(1);
    expect(rowY.rankA).toBe(2);
    // Under B (closeFinish only): Y wins.
    expect(rowX.rankB).toBe(2);
    expect(rowY.rankB).toBe(1);
    // Delta = rankA - rankB.
    expect(rowX.rankDelta).toBe(-1); // X dropped (B ranks it lower)
    expect(rowY.rankDelta).toBe(1); // Y rose (B ranks it higher)
  });
});
