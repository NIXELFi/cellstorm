// Determinism contract for the render package: the BattlePlayer's underlying sim loop
// (startSim + advance, the same helpers seekState uses) must produce results bit-identical to
// the headless runBattle for the same config. If this drifts, score-then-render is broken.
// Pure logic only — no Pixi instantiated.

import { describe, it, expect } from "vitest";
import { runBattle, normalizeConfig, makePrng } from "@cellstorm/sim";
import { startSim, advance, seekState, countsOf } from "../src/simCore";

const configs = [
  normalizeConfig({ seed: 7, teamCount: 2, powers: ["Glasshammer", "Swift"] }),
  normalizeConfig({ seed: 999, teamCount: 4, powers: ["Tank", "Plague", "Sniper", "Swift"] }),
  normalizeConfig({ seed: 4242, teamCount: 3, powers: ["Berserker", "Reflector", "Necromancer"] }),
];

describe("player sim loop matches runBattle (determinism contract)", () => {
  for (const cfg of configs) {
    it(`seed ${cfg.seed} (${cfg.teamCount} teams) yields identical winner + durationTicks`, () => {
      const expected = runBattle(cfg);

      // Drive the world exactly the way BattlePlayer.stepFrame does.
      const { state, sink } = startSim(cfg);
      let ended = false;
      while (!ended) ended = advance(state, sink);

      expect(state.world.winner).toBe(expected.summary.winner);
      // Player plays through the victory-beat outro, so it ends at totalTicks (fight + outro).
      expect(state.world.frame).toBe(expected.summary.totalTicks);
      // Event stream emitted while stepping is identical to the headless log.
      expect(sink.events).toEqual(expected.log.events);
    });

    it(`seed ${cfg.seed}: seekState(tick) lands on the same world state as stepping there`, () => {
      const expected = runBattle(cfg);
      const mid = Math.floor(expected.summary.durationTicks / 2);
      const sought = seekState(cfg, mid);
      expect(sought.world.frame).toBe(mid);

      const { state, sink } = startSim(cfg);
      while (state.world.frame < mid && !state.ended) advance(state, sink);
      // Same live counts and same cell positions => deterministic re-sim.
      expect(countsOf(sought.world)).toEqual(countsOf(state.world));
      expect(sought.world.cells.map((c) => [c.x, c.y, c.hp])).toEqual(
        state.world.cells.map((c) => [c.x, c.y, c.hp]),
      );
    });
  }

  it("seekState past battle end clamps at the ended frame", () => {
    const cfg = configs[0]!;
    const expected = runBattle(cfg);
    const sought = seekState(cfg, 10_000_000);
    expect(sought.ended).toBe(true);
    expect(sought.world.frame).toBe(expected.summary.totalTicks);
  });
});

describe("cosmetic PRNG is independent of the sim PRNG", () => {
  it("seeds a separate stream from config.seed XOR a constant", () => {
    // The player owns a cosmetic PRNG seeded independently; advancing it must not perturb the
    // sim. We assert the cosmetic stream is reproducible and distinct from the gameplay stream.
    const seed = 12345;
    const COSMETIC_SALT = 0x9e3779b9;
    const cosmeticA = makePrng((seed ^ COSMETIC_SALT) >>> 0);
    const cosmeticB = makePrng((seed ^ COSMETIC_SALT) >>> 0);
    const gameplay = makePrng(seed);
    expect([cosmeticA(), cosmeticA()]).toEqual([cosmeticB(), cosmeticB()]);
    expect(makePrng((seed ^ COSMETIC_SALT) >>> 0)()).not.toEqual(gameplay());
  });
});
