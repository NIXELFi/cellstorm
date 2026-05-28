import type { BattleLog } from "@cellstorm/sim";
import type { ScoreProfile } from "./types";

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Hard gates. Returns a list of failure reasons; empty means the battle is
 * eligible for scoring.
 */
export function runGates(log: BattleLog, profile: ScoreProfile): string[] {
  const reasons: string[] = [];

  // Gate 1: a clear winner is required.
  if (log.winner < 0) {
    reasons.push("no clear winner");
  }

  // Gate 2: duration must fall inside the target window.
  const minTicks = profile.targetMinSec * profile.fps;
  const maxTicks = profile.targetMaxSec * profile.fps;
  if (log.durationTicks < minTicks || log.durationTicks > maxTicks) {
    reasons.push(
      `duration ${log.durationTicks} ticks outside [${minTicks}, ${maxTicks}]`,
    );
  }

  // Gate 3: no long stretch of dead air between eliminations.
  const maxGapTicks = profile.maxStalemateSec * profile.fps;
  const elimTicks = log.events
    .filter((e) => e.type === "death" || e.type === "kill")
    .map((e) => e.tick);
  if (elimTicks.length > 0) {
    // Bound the run with start (0) and end (durationTicks) so leading/trailing
    // silence also counts as dead air.
    let prev = 0;
    let longest = 0;
    for (const t of elimTicks) {
      longest = Math.max(longest, t - prev);
      prev = t;
    }
    longest = Math.max(longest, log.durationTicks - prev);
    if (longest > maxGapTicks) {
      reasons.push(`dead air ${longest} ticks exceeds ${maxGapTicks}`);
    }
  }

  return reasons;
}

/**
 * The five drama components, each normalized to [0, 1]. Guards against empty /
 * single-element timelines and zero-death logs so a real battle never yields
 * NaN.
 */
export interface Components {
  leadVolatility: number;
  comeback: number;
  climaxTiming: number;
  closeFinish: number;
  sustainedChaos: number;
}

export function components(log: BattleLog, profile: ScoreProfile): Components {
  const tl = log.timeline;
  const n = tl.length;

  // --- leadVolatility: leader changes across the timeline. ---
  let leadChanges = 0;
  let prevLeader = -1;
  for (const snap of tl) {
    let leader = -1;
    let best = -Infinity;
    for (let team = 0; team < snap.counts.length; team++) {
      const c = snap.counts[team]!;
      if (c > best) {
        best = c;
        leader = team;
      }
    }
    if (prevLeader !== -1 && leader !== prevLeader) leadChanges++;
    prevLeader = leader;
  }
  const leadVolatility = n > 1 ? clamp01(leadChanges / (n - 1)) : 0;

  // --- comeback: 1 - winner's minimum population share over the timeline. ---
  let minShare = 1;
  if (log.winner >= 0 && n > 0) {
    for (const snap of tl) {
      const total = snap.counts.reduce((a, b) => a + b, 0);
      if (total <= 0) continue;
      const share = (snap.counts[log.winner] ?? 0) / total;
      if (share < minShare) minShare = share;
    }
  } else {
    minShare = 1;
  }
  const comeback = clamp01(1 - minShare);

  // --- climaxTiming: fraction of death events in the final 20% of ticks. ---
  const deaths = log.events.filter((e) => e.type === "death");
  let climaxTiming = 0;
  if (deaths.length > 0 && log.durationTicks > 0) {
    const threshold = log.durationTicks * 0.8;
    const lateDeaths = deaths.filter((e) => e.tick >= threshold).length;
    climaxTiming = clamp01(lateDeaths / deaths.length);
  }

  // --- closeFinish: 1 - (survivors / initialWinnerCount). ---
  let closeFinish = 0;
  if (log.winner >= 0 && n > 0) {
    const initialWinnerCount = tl[0]!.counts[log.winner] ?? 0;
    const survivors = tl[n - 1]!.counts[log.winner] ?? 0;
    if (initialWinnerCount > 0) {
      closeFinish = clamp01(1 - survivors / initialWinnerCount);
    }
  }

  // --- sustainedChaos: 1 - coefficient of variation of bucketed deaths. ---
  let sustainedChaos = 0;
  if (deaths.length > 0 && log.durationTicks > 0) {
    const bucketCount = Math.max(1, Math.min(n, 10));
    const buckets = new Array(bucketCount).fill(0) as number[];
    for (const e of deaths) {
      let b = Math.floor((e.tick / log.durationTicks) * bucketCount);
      if (b < 0) b = 0;
      if (b >= bucketCount) b = bucketCount - 1;
      buckets[b]!++;
    }
    const mean = buckets.reduce((a, b) => a + b, 0) / bucketCount;
    if (mean > 0) {
      const variance =
        buckets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / bucketCount;
      const cv = Math.sqrt(variance) / mean;
      sustainedChaos = clamp01(1 - cv);
    }
  }

  return { leadVolatility, comeback, climaxTiming, closeFinish, sustainedChaos };
}
