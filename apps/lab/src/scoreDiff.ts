import { score, type ScoreProfile, type BattleLog } from "@cellstorm/score";

export interface ScoreDiffRow {
  /** index of the log in the input array */
  index: number;
  /** stable id `${teamCount}:${powers}:${seed}` for readability */
  configId: string;
  scoreA: number;
  scoreB: number;
  passedA: boolean;
  passedB: boolean;
  /** 1-based rank under profile A (1 = best); 0 if it failed A's gates */
  rankA: number;
  /** 1-based rank under profile B */
  rankB: number;
  /** rankA - rankB; positive means profile B ranks it higher (better) */
  rankDelta: number;
}

function logConfigId(log: BattleLog): string {
  const c = log.config;
  return `${c.teamCount}:${c.powers.join(",")}:${c.seed}`;
}

/**
 * Rank a list of (index, score, passed) by score descending. Failed entries
 * (gate not passed) are not ranked and get rank 0. Returns a Map index->rank.
 */
function rankByScore(entries: { index: number; score: number; passed: boolean }[]): Map<number, number> {
  const ranked = entries
    .filter((e) => e.passed)
    .sort((x, y) => y.score - x.score);
  const out = new Map<number, number>();
  for (const e of entries) out.set(e.index, 0);
  ranked.forEach((e, i) => out.set(e.index, i + 1));
  return out;
}

/**
 * Compare how two ScoreProfiles rank the same set of battle logs. Returns one
 * row per log with each profile's score, pass flag, and rank, plus the rank
 * delta (how much the ranking moved between profiles).
 */
export function scoreDiff(logs: BattleLog[], a: ScoreProfile, b: ScoreProfile): ScoreDiffRow[] {
  const reportsA = logs.map((log) => score(log, a));
  const reportsB = logs.map((log) => score(log, b));

  const ranksA = rankByScore(
    reportsA.map((r, index) => ({ index, score: r.score, passed: r.passed })),
  );
  const ranksB = rankByScore(
    reportsB.map((r, index) => ({ index, score: r.score, passed: r.passed })),
  );

  return logs.map((log, index) => {
    const ra = reportsA[index]!;
    const rb = reportsB[index]!;
    const rankA = ranksA.get(index)!;
    const rankB = ranksB.get(index)!;
    return {
      index,
      configId: logConfigId(log),
      scoreA: ra.score,
      scoreB: rb.score,
      passedA: ra.passed,
      passedB: rb.passed,
      rankA,
      rankB,
      rankDelta: rankA - rankB,
    };
  });
}
