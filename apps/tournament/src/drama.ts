// Shared drama comparator used by match selection and the finale search: a battle is "better" if it
// passes the score gates when the incumbent doesn't, or (same gate status) has a higher drama score.
// Ties return false so the earlier (lower-seed) candidate stays — keeping selection stable/deterministic.
import type { DramaReport } from "@cellstorm/score";

export function betterDrama(cand: DramaReport, inc: DramaReport): boolean {
  if (cand.passed !== inc.passed) return cand.passed;
  return cand.score > inc.score;
}
