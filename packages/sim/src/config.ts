import type { BattleConfig } from "./types";

export const DEFAULTS = {
  totalCells: 900,
  arena: { width: 280, height: 498 },
  maxTicks: 60 * 75, // 75s @ 60fps hard cap
} as const;

export type BattleConfigInput =
  Pick<BattleConfig, "seed" | "teamCount" | "powers"> & Partial<BattleConfig>;

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
  };
}
