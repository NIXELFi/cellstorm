// Public surface of @cellstorm/render — the shared scene + HUD compositor + player used by
// BOTH the harness preview and the 4K renderer (WYSIWYG by construction).

// Player.
export { BattlePlayer, COSMETIC_SALT } from "./player";
export type { PlayerOptions } from "./player";

// Scene.
export { PixiScene } from "./scene";
export type { SceneOptions } from "./scene";

// HUD.
export { Hud } from "./hud/compositor";
export type { HudOptions } from "./hud/compositor";
export { DEFAULT_HUD } from "./hud/types";
export type { HudConfig } from "./hud/types";
export { Counters } from "./hud/counters";
export { Leaderboard } from "./hud/leaderboard";
export { Intro } from "./hud/intro";
export { Winner } from "./hud/winner";

// HUD pure logic (shared with the harness HUD editor / sparkline).
export {
  easeCounter,
  leaderboardOrder,
  leaderTeam,
  introVisible,
  introAlpha,
  winnerAlpha,
  defaultIntroTitle,
} from "./hud/logic";
export type { RankedTeam } from "./hud/logic";

// Theme.
export { THEME, teamColor, teamName } from "./theme";
export type { Theme, TeamTheme } from "./theme";

// Cosmetic FX (cosmetic PRNG only).
export { ParticleField } from "./fx";
export type { CosmeticParticle } from "./fx";

// Pure sim-driving seam (shared determinism contract; no Pixi).
export { startSim, advance, seekState, countsOf } from "./simCore";
export type { SimState } from "./simCore";
