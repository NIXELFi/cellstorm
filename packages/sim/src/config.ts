import type { AiParams, BattleConfig } from "./types";

// Default AI tuning, from the aggression/duration optimization study (see docs/lab studies).
// vs the original prototype values this took battles from 20% -> 88% resolving with a clear
// winner, ~3x more landing in the 15-40s window, and ~4.4x drama yield. The recipe: wider
// perception so cells find each other, no retreating (commit to the fight), a small hunt nudge
// to converge stragglers, and reduced melee lethality to stretch fights to a watchable ~20s.
// Original values shown in comments for reference.
export const DEFAULT_AI: AiParams = {
  perceptionR2: 4096, // 64px radius (was 2500/50px)
  scanWindow: 5, // was 3
  engageForce: 0.2, // unchanged — gentle, not frantic
  aggroEngageForce: 0.3, // unchanged
  retreatHpFrac: 0, // was 0.28 — retreat disabled; cells commit
  flockWeight: 0.04,
  huntCenterBias: 0.04, // was 0 — small pull to arena center converges stragglers
  stalemateTicks: 60 * 12,
  damageScale: 0.15, // tuned so video length centers ~25s (p25 ~15s, p75 ~40s); was 0.4 (~13s median)
};

export const DEFAULTS = {
  totalCells: 900,
  arena: { width: 280, height: 498 },
  maxTicks: 60 * 75, // 75s @ 60fps hard cap
  outroTicks: 108, // 1.8s victory beat after the last cell dies, so the wipe + win land + linger
} as const;

export type BattleConfigInput =
  Pick<BattleConfig, "seed" | "teamCount" | "powers"> &
  Partial<Omit<BattleConfig, "ai">> & { ai?: Partial<AiParams> };

export function normalizeConfig(input: BattleConfigInput): BattleConfig {
  if (input.powers.length !== input.teamCount) {
    throw new Error(`powers length ${input.powers.length} != teamCount ${input.teamCount}`);
  }
  if (input.teamCount < 2 || input.teamCount > 6) {
    throw new Error(`teamCount must be 2..6, got ${input.teamCount}`);
  }
  const totalCells = input.totalCells ?? DEFAULTS.totalCells;
  if (Math.round(totalCells / input.teamCount) < 1) {
    throw new Error("totalCells too small for teamCount");
  }
  return {
    seed: input.seed,
    teamCount: input.teamCount,
    powers: input.powers,
    totalCells,
    arena: input.arena ?? { ...DEFAULTS.arena },
    maxTicks: input.maxTicks ?? DEFAULTS.maxTicks,
    outroTicks: input.outroTicks ?? DEFAULTS.outroTicks,
    ai: { ...DEFAULT_AI, ...input.ai },
  };
}
