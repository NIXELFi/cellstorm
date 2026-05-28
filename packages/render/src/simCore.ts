// Pure sim-driving logic shared by BattlePlayer — NO Pixi imports. This is the determinism
// seam: the player advances the world using EXACTLY these helpers, which call the sim's own
// `createWorld`/`step`. Because the sim PRNG is seeded from config.seed and nothing here reads
// wall-clock or Math.random, re-simming a config from tick 0 is bit-identical every time and
// identical to the headless `runBattle`. The player's scene reads world state; it never mutates
// gameplay. Unit-tested against runBattle to prove the player can't drift from the scorer.

import {
  createWorld,
  step,
  teamCounts,
  EventSink,
  type BattleConfig,
  type World,
} from "@cellstorm/sim";

export interface SimState {
  world: World;
  /** Whether the battle has ended (winner resolved or stalemate/cap). */
  ended: boolean;
}

/** Fresh world + sink at tick 0 for a config. */
export function startSim(config: BattleConfig): { state: SimState; sink: EventSink } {
  const world = createWorld(config);
  const sink = new EventSink();
  return { state: { world, ended: false }, sink };
}

/** Advance one tick in place. Returns true once the battle has ended. */
export function advance(state: SimState, sink: EventSink): boolean {
  if (state.ended) return true;
  state.ended = step(state.world, sink);
  return state.ended;
}

/**
 * Deterministically re-sim a config from tick 0 to exactly `tick` (or battle end, whichever
 * comes first). Returns the resulting world + ended flag. This is what powers scrubbing and
 * "jump to climax": cheap, deterministic, no stored frames.
 */
export function seekState(config: BattleConfig, tick: number): SimState {
  const { state, sink } = startSim(config);
  while (state.world.frame < tick && !state.ended) {
    advance(state, sink);
  }
  return state;
}

/** Live team counts of a world (re-exported for player/HUD convenience). */
export function countsOf(world: World): number[] {
  return teamCounts(world);
}
