import { describe, it, expect } from "vitest";
import type { ResultRow } from "@cellstorm/cli";
import type { BattleLog } from "@cellstorm/sim";
import { DEFAULT_PROFILE, type ScoreProfile } from "@cellstorm/score";
import { rerankCandidates } from "../src/ui/rerankLogic";

function row(id: string, storedScore: number, seed: number): ResultRow {
  return {
    configId: id,
    config: { teamCount: 2, powers: ["Tank", "Plague"], seed } as never,
    score: storedScore,
    breakdown: {},
    winner: 0,
    durationTicks: 100,
    batchId: "b",
  };
}

// Build a synthetic log that resolves cleanly within the default gate window AND has no dead-air
// stretch longer than maxStalemateSec, so it PASSES all gates. Deaths are spread densely enough to
// satisfy the dead-air gate, with a cluster at the end for a non-degenerate climax component.
function passingLog(seed: number, _ticks: number): BattleLog {
  const fps = DEFAULT_PROFILE.fps;
  const duration = Math.round(((DEFAULT_PROFILE.targetMinSec + DEFAULT_PROFILE.targetMaxSec) / 2) * fps);
  const timeline = Array.from({ length: duration }, (_, i) => ({
    tick: i,
    // team 0 dwindles to 0 by the end (one team alive => gate passes), team 1 survives.
    counts: [Math.max(0, 10 - Math.floor((i / duration) * 11)), 10 - Math.floor((i / duration) * 3)],
  }));
  // Spread deaths every ~200 ticks (< maxStalemateSec*fps=480) so the dead-air gate passes, and
  // also bound tick 0 and duration. Extra deaths near the end give a real climax.
  const gap = 200;
  const events: BattleLog["events"] = [];
  for (let t = gap; t < duration; t += gap) {
    events.push({ type: "death", tick: t, cellId: t, x: 0, y: 0, team: 0 } as never);
  }
  events.push({ type: "death", tick: duration - 30, cellId: duration, x: 0, y: 0, team: 0 } as never);
  events.push({ type: "death", tick: duration - 5, cellId: duration + 1, x: 0, y: 0, team: 0 } as never);
  return {
    config: { teamCount: 2, powers: ["Tank", "Plague"], seed } as never,
    events,
    timeline,
    durationTicks: duration,
    winner: 1,
  } as unknown as BattleLog;
}

// A log that stalemates (both teams alive at end) => fails the "one team alive" gate.
function failingLog(seed: number): BattleLog {
  const duration = 200;
  const timeline = Array.from({ length: duration }, (_, i) => ({ tick: i, counts: [5, 5] }));
  return {
    config: { teamCount: 2, powers: ["Tank", "Plague"], seed } as never,
    events: [],
    timeline,
    durationTicks: duration,
    winner: -1,
  } as unknown as BattleLog;
}

describe("rerankCandidates", () => {
  it("sorts passing candidates by re-scored value, descending", () => {
    const rows = [row("a", 0.1, 1), row("b", 0.9, 2)];
    const logs = new Map<string, BattleLog>([
      ["a", passingLog(1, 0)],
      ["b", passingLog(2, 0)],
    ]);
    const ranked = rerankCandidates(rows, logs, DEFAULT_PROFILE);
    // every entry is re-scored from its log (stored score ignored)
    expect(ranked.every((c) => c.rescored)).toBe(true);
    // sorted descending by the re-scored value
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
    }
  });

  it("pushes gate failures to the bottom regardless of stored score", () => {
    const rows = [row("fail", 99, 1), row("pass", 0.01, 2)];
    const logs = new Map<string, BattleLog>([
      ["fail", failingLog(1)],
      ["pass", passingLog(2, 0)],
    ]);
    const ranked = rerankCandidates(rows, logs, DEFAULT_PROFILE);
    expect(ranked[0]!.row.configId).toBe("pass");
    expect(ranked[0]!.passed).toBe(true);
    expect(ranked.at(-1)!.row.configId).toBe("fail");
    expect(ranked.at(-1)!.passed).toBe(false);
  });

  it("falls back to the stored score (and treats as passed) when no log is loaded yet", () => {
    const rows = [row("x", 0.7, 1), row("y", 0.3, 2)];
    const ranked = rerankCandidates(rows, new Map(), DEFAULT_PROFILE);
    expect(ranked.map((c) => c.row.configId)).toEqual(["x", "y"]);
    expect(ranked.every((c) => !c.rescored && c.passed)).toBe(true);
    expect(ranked[0]!.score).toBe(0.7);
  });

  it("re-ranks when the profile weights change (no re-sim, pure re-score)", () => {
    const rows = [row("a", 0, 1), row("b", 0, 2)];
    const logs = new Map<string, BattleLog>([
      ["a", passingLog(1, 0)],
      ["b", passingLog(2, 0)],
    ]);
    const heavyComeback: ScoreProfile = {
      ...DEFAULT_PROFILE,
      weights: { ...DEFAULT_PROFILE.weights, comeback: 10, leadVolatility: 0 },
    };
    const onlyClose: ScoreProfile = {
      ...DEFAULT_PROFILE,
      weights: { leadVolatility: 0, comeback: 0, climaxTiming: 0, closeFinish: 10, sustainedChaos: 0 },
    };
    const s1 = rerankCandidates(rows, logs, heavyComeback)[0]!.score;
    const s2 = rerankCandidates(rows, logs, onlyClose)[0]!.score;
    // Different weight profiles produce different top scores from the SAME cached logs.
    expect(s1).not.toBe(s2);
  });

  it("is a deterministic, stable sort (configId tiebreak)", () => {
    const rows = [row("zzz", 1, 1), row("aaa", 1, 2)];
    const ranked = rerankCandidates(rows, new Map(), DEFAULT_PROFILE);
    // equal scores -> tiebreak by configId ascending
    expect(ranked.map((c) => c.row.configId)).toEqual(["aaa", "zzz"]);
  });
});
