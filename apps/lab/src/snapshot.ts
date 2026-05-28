import { runBattle, normalizeConfig, type BattleConfigInput } from "@cellstorm/sim";
import { LAB_TOTAL_CELLS } from "./roundRobin";

export interface SnapshotEntry {
  /** stable id: `${teamCount}:${powers}:${seed}` (matches the cli store) */
  configId: string;
  winner: number;
  durationTicks: number;
}

/** Stable configId for a battle config (matches @cellstorm/cli store.configId). */
export function configId(c: { teamCount: number; powers: string[]; seed: number }): string {
  return `${c.teamCount}:${c.powers.join(",")}:${c.seed}`;
}

/**
 * Regression snapshot: run each config and record (configId, winner, duration).
 * Because the sim is deterministic, this is STABLE across runs — a useful
 * regression fixture: re-run after a sim change and diff against a stored
 * snapshot to catch unintended behavior shifts.
 *
 * Configs default to LAB_TOTAL_CELLS unless they specify totalCells, keeping
 * the snapshot fast while remaining fully deterministic.
 */
export function snapshot(configs: BattleConfigInput[]): SnapshotEntry[] {
  return configs.map((input) => {
    const cfg = normalizeConfig({
      totalCells: LAB_TOTAL_CELLS,
      ...input,
    });
    const { summary } = runBattle(cfg);
    return {
      configId: configId(cfg),
      winner: summary.winner,
      durationTicks: summary.durationTicks,
    };
  });
}

/**
 * A small built-in default config set for the snapshot / scorediff subcommands.
 * Mixes resolving multi-team battles (so scorediff has scored, rankable rows)
 * with a couple of 1v1s that stalemate (to exercise the gate path). NOTE: in
 * this sim most 1v1s stalemate; decisive outcomes need 4+ teams.
 */
export const DEFAULT_SNAPSHOT_CONFIGS: BattleConfigInput[] = [
  { seed: 0, teamCount: 4, powers: ["Berserker", "Goliath", "Glasshammer", "Swift"] }, // resolves
  { seed: 3, teamCount: 6, powers: ["Glasshammer", "Goliath", "Bomb", "Swift", "Berserker", "Brute"] }, // resolves
  { seed: 1, teamCount: 2, powers: ["Tank", "Plague"] }, // stalemate
  { seed: 3, teamCount: 3, powers: ["Tank", "Plague", "Sniper"] }, // stalemate
];
