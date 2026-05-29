import { describe, it, expect } from "vitest";
import type { BattleSummary } from "@cellstorm/sim";
import type { ChosenBattle, Entrant } from "../src/types";
import { selectFinale } from "../src/finale";

const F: [Entrant, Entrant] = ["Top", "Bot"];

function cb(seed: number, winnerTeam: 0 | 1, score: number, resolved = true): ChosenBattle {
  const summary: BattleSummary = { winner: winnerTeam, durationTicks: 600, totalTicks: 700, survivors: 5, resolved };
  return {
    seed,
    powers: F,
    winnerTeam,
    winner: winnerTeam === 0 ? F[0] : F[1],
    drama: { passed: true, score, breakdown: {}, reasons: [] },
    summary,
  };
}

describe("selectFinale", () => {
  it("prefers a 1-1 split into a decisive game three", () => {
    const r = selectFinale(F, [cb(1, 0, 9), cb(2, 1, 8), cb(3, 0, 10), cb(4, 1, 3)]);
    expect(r.kind).toBe("tiebreak");
    expect(r.games).toHaveLength(3);
    expect(new Set(r.games.map((g) => g.seed)).size).toBe(3);
    expect(r.games[0]!.winnerTeam).not.toBe(r.games[1]!.winnerTeam); // split
    expect(r.games[0]!.drama.score).toBeLessThanOrEqual(r.games[1]!.drama.score); // build-up
    expect(r.games[2]!.winner).toBe(r.champion); // game three decides
    expect(r.runnerUp).toBe(r.champion === "Top" ? "Bot" : "Top");
  });

  it("uses the best win for each finalist as the split and the best remaining as the decider", () => {
    // best top win seed3(10), best bot win seed2(8); best remaining decisive seed1(9, top) -> g3
    const r = selectFinale(F, [cb(1, 0, 9), cb(2, 1, 8), cb(3, 0, 10), cb(4, 1, 3)]);
    expect(r.games[2]!.seed).toBe(1);
    expect(r.champion).toBe("Top");
    expect(new Set([r.games[0]!.seed, r.games[1]!.seed])).toEqual(new Set([2, 3]));
  });

  it("falls back to an honest best-of-three when one finalist never wins", () => {
    const r = selectFinale(F, [cb(1, 0, 9), cb(2, 0, 8), cb(3, 0, 7), cb(4, 0, 6)]);
    expect(r.kind).toBe("honest");
    expect(r.champion).toBe("Top");
    expect(r.games).toHaveLength(3);
    expect(r.games[0]!.drama.score).toBeGreaterThanOrEqual(r.games[2]!.drama.score); // descending
  });

  it("ignores unresolved battles for the split", () => {
    const r = selectFinale(F, [cb(1, 0, 9), cb(2, 0, 8), cb(3, 1, 10, false), cb(4, 0, 6)]);
    expect(r.kind).toBe("honest");
    expect(r.champion).toBe("Top");
  });
});
