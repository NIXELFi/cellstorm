// PURE logic over a BattleLog: "jump to climax" death-cluster detection and sparkline data
// reduction. No DOM, no Pixi — unit-tested in test/logLogic.test.ts.

import type { BattleLog } from "@cellstorm/sim";

/**
 * Find the tick of the densest death cluster in the FINAL portion of the battle (the climax).
 * We bin death events into windows over the last `finalFraction` of the battle and return the
 * start tick of the busiest window. Falls back to ~80% of the duration when there are no deaths.
 */
export function climaxTick(log: BattleLog, finalFraction = 0.4, windowTicks = 60): number {
  const duration = log.durationTicks;
  if (duration <= 0) return 0;
  const cutoff = Math.floor(duration * (1 - finalFraction));
  const deaths = log.events.filter((e) => e.type === "death" && e.tick >= cutoff);
  if (deaths.length === 0) return Math.floor(duration * 0.8);

  // Bucket by window; track the densest.
  const counts = new Map<number, number>();
  for (const e of deaths) {
    const bucket = Math.floor(e.tick / windowTicks);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  let bestBucket = 0;
  let bestCount = -1;
  for (const [bucket, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestBucket = bucket;
    }
  }
  return bestBucket * windowTicks;
}

export interface SparklineData {
  /** One series per team; each is an array of alive-counts sampled along the timeline. */
  series: number[][];
  /** Max count across all samples (for y-scaling). */
  max: number;
  /** Number of x samples. */
  length: number;
}

/**
 * Reduce a log's per-tick teamCount timeline to at most `maxPoints` samples per team for a
 * compact sparkline. Evenly subsamples (keeps the last point so the finish is exact).
 */
export function sparklineData(log: BattleLog, maxPoints = 120): SparklineData {
  const tl = log.timeline;
  const teamCount = tl[0]?.counts.length ?? 0;
  if (tl.length === 0 || teamCount === 0) {
    return { series: [], max: 0, length: 0 };
  }

  // Choose sample indices.
  let indices: number[];
  if (tl.length <= maxPoints) {
    indices = tl.map((_, i) => i);
  } else {
    indices = [];
    const stride = (tl.length - 1) / (maxPoints - 1);
    for (let i = 0; i < maxPoints; i++) indices.push(Math.round(i * stride));
    indices[indices.length - 1] = tl.length - 1; // exact finish
  }

  const series: number[][] = Array.from({ length: teamCount }, () => []);
  let max = 0;
  for (const idx of indices) {
    const counts = tl[idx]!.counts;
    for (let t = 0; t < teamCount; t++) {
      const v = counts[t] ?? 0;
      series[t]!.push(v);
      if (v > max) max = v;
    }
  }
  return { series, max, length: indices.length };
}
