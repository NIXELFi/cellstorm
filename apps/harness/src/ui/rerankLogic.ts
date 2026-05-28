// PURE logic for live ScoreProfile re-ranking. Given the currently loaded candidates, their
// (cached) battle logs, and a ScoreProfile, re-score each log with `score(log, profile)` and
// return the candidates sorted by the new score — gate failures (passed=false) sink to the
// bottom. No DOM, no Pixi, no fetch — unit-tested in test/rerankLogic.test.ts.
//
// This never re-simulates: scoring reads a saved log. Candidates without a loaded log keep their
// original stored score (so the grid stays usable while logs stream in), but are treated as
// passed so they don't get unfairly buried before their log arrives.

import type { ResultRow } from "@cellstorm/cli";
import type { BattleLog } from "@cellstorm/sim";
import { score, type ScoreProfile } from "@cellstorm/score";

export interface RankedCandidate {
  row: ResultRow;
  /** Score under the active profile (re-scored from the log if available, else the stored score). */
  score: number;
  /** Whether this candidate passes the active profile's hard gates. */
  passed: boolean;
  /** True when the displayed score came from re-scoring a loaded log (vs. the stored fallback). */
  rescored: boolean;
}

/**
 * Re-rank candidates under `profile` using their logs. `logs` maps configId -> BattleLog for the
 * logs already fetched/cached in the browser; a missing entry means "not loaded yet" and the
 * candidate falls back to its stored score (still treated as passed). Sort order:
 *   1. passed candidates before failed ones,
 *   2. then by descending score,
 *   3. then by configId for a stable, deterministic tiebreak.
 */
export function rerankCandidates(
  rows: ResultRow[],
  logs: Map<string, BattleLog>,
  profile: ScoreProfile,
): RankedCandidate[] {
  const scored: RankedCandidate[] = rows.map((row) => {
    const log = logs.get(row.configId);
    if (!log) {
      return { row, score: row.score, passed: true, rescored: false };
    }
    const report = score(log, profile);
    return { row, score: report.score, passed: report.passed, rescored: true };
  });

  return scored.sort((a, b) => {
    if (a.passed !== b.passed) return a.passed ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.row.configId < b.row.configId ? -1 : a.row.configId > b.row.configId ? 1 : 0;
  });
}
