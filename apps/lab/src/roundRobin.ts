import { runBattle, normalizeConfig } from "@cellstorm/sim";

/**
 * Default totalCells for lab battles. The lab is about *relative* comparison
 * (power A vs power B, profile A vs profile B), not shipping these exact
 * battles, so we run smaller (faster) battles than the 900-cell production
 * default. Determinism is unaffected — same seed still yields the same battle.
 */
export const LAB_TOTAL_CELLS = 120;

export interface RoundRobinResult {
  /** ordered list of powers in the matrix */
  powers: string[];
  /** seeds run per ordered pair */
  seeds: number;
  /** wins[a][b] = number of seeds power `a` (team 0) beat power `b` (team 1) */
  wins: Map<string, Map<string, number>>;
  /**
   * Fraction of the `seeds` battles that power `a` (as team 0) beat power `b`
   * (as team 1). Stalemates count as no-win for either side, so:
   *   winRate(a,b) + winRate(b,a)_reversed + stalemateRate = 1
   * Denominator is always `seeds`. Returns a value in [0,1].
   */
  winRate(a: string, b: string): number;
}

/**
 * Round-robin over an ordered set of powers. For every ORDERED pair (a,b) of
 * distinct powers, runs `seeds` 2-team battles (powers [a,b], seeds 0..seeds-1)
 * and tallies how often team 0 (power a) won.
 */
export function roundRobin(powers: string[], opts: { seeds: number }): RoundRobinResult {
  const { seeds } = opts;
  const wins = new Map<string, Map<string, number>>();
  for (const a of powers) wins.set(a, new Map<string, number>());

  for (const a of powers) {
    for (const b of powers) {
      if (a === b) continue;
      let aWins = 0;
      for (let seed = 0; seed < seeds; seed++) {
        const cfg = normalizeConfig({
          seed,
          teamCount: 2,
          powers: [a, b],
          totalCells: LAB_TOTAL_CELLS,
        });
        const { summary } = runBattle(cfg);
        if (summary.winner === 0) aWins++;
      }
      wins.get(a)!.set(b, aWins);
    }
  }

  return {
    powers,
    seeds,
    wins,
    winRate(a: string, b: string): number {
      if (seeds === 0) return 0;
      const aWins = wins.get(a)?.get(b) ?? 0;
      return aWins / seeds;
    },
  };
}
