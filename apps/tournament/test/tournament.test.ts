import { describe, it, expect } from "vitest";
import { runTournament } from "../src/tournament";

// Tiny knobs so the integration test runs real battles quickly. Each battle is a full 1v1 sim
// (~0.6s), so we compute the minimum set of tournaments ONCE and share them across assertions:
// `a`/`aAgain` for determinism + structure, `b` for seed variation.
const opts = { seedsPerMatch: 2, finaleBudget: 4 };
const a = runTournament(1, opts);
const aAgain = runTournament(1, opts);
const b = runTournament(2, opts);

describe("runTournament (integration, tiny knobs)", () => {
  it("is a deterministic function of the seed", () => {
    expect(aAgain).toEqual(a);
  });

  it("produces 16 entrants, a full bracket, two finalists, and a champion", () => {
    expect(a.bracket.entrants).toHaveLength(16);
    expect(new Set(a.bracket.entrants).size).toBe(16);
    expect(a.bracket.rounds.ro16).toHaveLength(8);
    expect(a.bracket.rounds.qf).toHaveLength(4);
    expect(a.bracket.rounds.sf).toHaveLength(2);
    expect(a.bracket.finalists).toHaveLength(2);
    expect(a.finale.games.length).toBeGreaterThanOrEqual(2);
    expect([a.bracket.finalists[0], a.bracket.finalists[1]]).toContain(a.champion);
    expect(a.champion).not.toBe(a.runnerUp);
    expect(a.third).not.toBeNull();
  });

  it("varies with the seed", () => {
    const same = a.champion === b.champion && a.bracket.entrants.join() === b.bracket.entrants.join();
    expect(same).toBe(false);
  });
});
