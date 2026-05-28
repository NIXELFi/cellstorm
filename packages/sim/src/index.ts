// Public surface of @cellstorm/sim.

// Driver + battle artifacts.
export { runBattle } from "./battle";
export type { BattleLog, BattleSummary } from "./battle";

// World + stepping.
export { createWorld, teamCounts, rebuildGrid, makeCell, GRID_SIZE, BASE_HP, BASE_RADIUS } from "./world";
export type { World } from "./world";
export { step } from "./step";

// Powers + config.
export { POWERS, POWER_NAMES, powerByName } from "./powers";
export { normalizeConfig, DEFAULTS, DEFAULT_AI } from "./config";
export type { BattleConfigInput } from "./config";

// Events.
export { EventSink } from "./events";
export type { SimEvent } from "./events";

// PRNG helpers (re-exported so downstream packages import from the package root).
export { makePrng, randInt, shuffle } from "./prng";
export type { Prng } from "./prng";

// Core types.
export type {
  Power, Cell, Projectile, Corpse, ArenaParams, AiParams, BattleConfig, TeamCountSnapshot,
} from "./types";
