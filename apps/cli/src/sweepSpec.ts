import { normalizeConfig, POWER_NAMES, makePrng, shuffle, type BattleConfig } from "@cellstorm/sim";

export type PowerAssignment =
  | { mode: "fixed"; names: string[] }
  | { mode: "random" }                          // pick teamCount distinct powers per seed
  | { mode: "pool"; pool: string[] };           // pick teamCount distinct from a pool

export interface SweepSpec {
  teamCount: number | number[];
  powers: PowerAssignment;
  seeds: { from: number; to: number } | number[];
  totalCells?: number;
  limit?: number;
}

function seedList(s: SweepSpec["seeds"]): number[] {
  if (Array.isArray(s)) return s;
  const out: number[] = [];
  for (let i = s.from; i <= s.to; i++) out.push(i);
  return out;
}
function teamCountList(tc: SweepSpec["teamCount"]): number[] {
  return Array.isArray(tc) ? tc : [tc];
}
function powersFor(a: PowerAssignment, teamCount: number, seed: number): string[] {
  if (a.mode === "fixed") return a.names;
  const pool = a.mode === "pool" ? [...a.pool] : [...POWER_NAMES];
  const prng = makePrng(seed ^ 0x9e3779b9); // distinct deterministic stream from sim
  return shuffle(prng, pool).slice(0, teamCount);
}

export function expand(spec: SweepSpec): BattleConfig[] {
  const out: BattleConfig[] = [];
  const seeds = seedList(spec.seeds);
  const tcs = teamCountList(spec.teamCount);
  outer: for (const tc of tcs) {
    for (const seed of seeds) {
      const powers = powersFor(spec.powers, tc, seed);
      out.push(normalizeConfig({ seed, teamCount: tc, powers, totalCells: spec.totalCells }));
      if (spec.limit && out.length >= spec.limit) break outer;
    }
  }
  return out;
}
