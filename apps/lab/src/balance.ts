import { runBattle, normalizeConfig, POWER_NAMES, makePrng, shuffle } from "@cellstorm/sim";
import { LAB_TOTAL_CELLS } from "./roundRobin";

export interface PowerStat {
  power: string;
  /** number of battles this power appeared in */
  battles: number;
  /** fraction of those battles this power won, in [0,1] */
  winRate: number;
  /** fraction of those battles that ended in a stalemate, in [0,1] */
  stalemateRate: number;
  /** average battle duration (ticks) over the battles this power appeared in */
  avgDurationTicks: number;
}

export interface BalanceOptions {
  /** powers to include; defaults to all 20 */
  powers?: string[];
  /** teams per battle */
  teamCount: number;
  /** number of random matchups (battles) to sweep */
  seeds: number;
}

/**
 * Aggregate per-power analytics across a deterministic random sweep. For each
 * of `seeds` battles, picks `teamCount` distinct powers (seeded shuffle) and
 * runs one battle, then tallies appearances, wins, stalemates and durations
 * per power. Deterministic: the matchup PRNG is seeded from the sweep size.
 *
 * Uses LAB_TOTAL_CELLS for speed — relative comparison, not production output.
 */
export function balanceReport(opts: BalanceOptions): PowerStat[] {
  const powers = opts.powers ?? POWER_NAMES;
  const { teamCount, seeds } = opts;

  const battles = new Map<string, number>();
  const wins = new Map<string, number>();
  const stalemates = new Map<string, number>();
  const durSum = new Map<string, number>();
  for (const p of powers) {
    battles.set(p, 0);
    wins.set(p, 0);
    stalemates.set(p, 0);
    durSum.set(p, 0);
  }

  // Deterministic matchup generator, distinct from the battle seed.
  const matchupPrng = makePrng(0x5eed ^ (teamCount * 131) ^ (seeds * 977));

  for (let seed = 0; seed < seeds; seed++) {
    const pool = shuffle(matchupPrng, [...powers]);
    const lineup = pool.slice(0, teamCount);
    if (lineup.length < teamCount) continue; // not enough distinct powers

    const cfg = normalizeConfig({
      seed,
      teamCount,
      powers: lineup,
      totalCells: LAB_TOTAL_CELLS,
    });
    const { summary } = runBattle(cfg);
    const resolved = summary.resolved;

    lineup.forEach((p, team) => {
      battles.set(p, battles.get(p)! + 1);
      durSum.set(p, durSum.get(p)! + summary.durationTicks);
      if (!resolved) stalemates.set(p, stalemates.get(p)! + 1);
      else if (summary.winner === team) wins.set(p, wins.get(p)! + 1);
    });
  }

  const stats: PowerStat[] = powers.map((p) => {
    const n = battles.get(p)!;
    return {
      power: p,
      battles: n,
      winRate: n ? wins.get(p)! / n : 0,
      stalemateRate: n ? stalemates.get(p)! / n : 0,
      avgDurationTicks: n ? durSum.get(p)! / n : 0,
    };
  });

  // Sort strongest-first for readable reports.
  stats.sort((a, b) => b.winRate - a.winRate);
  return stats;
}
