import { describe, it, expect } from "vitest";
import { runTournament } from "../src/tournament";
import { planSegments } from "../src/segments";

describe("planSegments", () => {
  const result = runTournament(1, { seedsPerMatch: 2, finaleBudget: 4 });
  const segs = planSegments(result);

  it("starts with intro and ends with champion then podium", () => {
    expect(segs[0]!.label).toBe("intro");
    expect(segs.at(-1)!.label).toBe("podium");
    expect(segs.at(-2)!.label).toBe("champion");
  });

  it("follows each of the 14 bracket match clips immediately with its beat", () => {
    const matchSegs = segs.filter((s) => /^(ro16|qf|sf)-m\d+$/.test(s.label));
    expect(matchSegs).toHaveLength(14);
    segs.forEach((s, i) => {
      if (/^(ro16|qf|sf)-m\d+$/.test(s.label)) {
        expect(segs[i + 1]!.label).toMatch(/^(ro16|qf|sf)-beat\d+$/);
      }
    });
  });

  it("plays the finale games in order with score interstitials between (not after the last)", () => {
    const games = segs.filter((s) => /^final-g\d+$/.test(s.label));
    const scores = segs.filter((s) => /^final-score\d+$/.test(s.label));
    expect(games).toHaveLength(result.finale.games.length);
    expect(scores).toHaveLength(result.finale.games.length - 1);
  });

  it("gives every scene a positive duration", () => {
    for (const s of segs) {
      if (s.kind === "scene") expect(s.durationSec).toBeGreaterThan(0);
    }
  });
});
