// PURE opening-sequence model for the "cold open" hook, SHARED by the headless renderer
// (apps/renderer renderBattle) and the harness live preview (apps/harness playerPanel) so the
// preview matches the render (WYSIWYG). Given a (deterministic) BattleLog and the number of captured
// frames, it decides the ORDER in which frames are shown: a rapid multi-cut flash-forward MONTAGE of
// several distinct peak-action moments (hard cuts between them, building to the most intense), then a
// hard cut to t=0. It reads only the event log (deterministic) and returns frame indices — it never
// touches the sim, so the battle itself is byte-identical; only the opening composition changes.
// No Pixi/DOM imports (exported via the `@cellstorm/render/opening` subpath, like hud-config), so the
// Node-side renderer can import it without pulling in pixi. Unit-tested in test/opening.test.ts.

import type { BattleLog } from "@cellstorm/sim";

export interface OpeningConfig {
  /** Master switch — when false the output is the plain battle (frames 0..N), no teaser. */
  enabled: boolean;
  /** Duration of EACH montage cut in milliseconds. ~250-350ms reads as a deliberate hard cut you can
   *  actually register; much less and it flickers past. Total teaser ≈ cuts × clipMs. */
  clipMs: number;
  /** Number of hard-cut montage clips in the teaser (distinct peak moments). 1 = a single clip. */
  cuts: number;
  /** Sim/output frame rate (fixed 60 for cellstorm) — converts clipMs to a frame count. */
  fps: number;
  /** Search only the back fraction of the FIGHT for the peaks, so each clip is a payoff (a team
   *  getting wiped) and never the opening clash (which looks like t=0 and spoils nothing). */
  peakBackFraction: number;
}

export const DEFAULT_OPENING: OpeningConfig = {
  enabled: true,
  clipMs: 300, // ~300ms per cut × 3 cuts ≈ 0.9s montage — each cut is clearly visible
  cuts: 3,
  fps: 60,
  peakBackFraction: 0.6,
};

// Per-event "visual intensity" weights for scoring a window. Deaths are the strongest motion +
// stakes signal; explosions (Bomb, Glasshammer bursts) are big and bright; projectile fire is minor.
const EVENT_WEIGHT: Record<string, number> = {
  death: 3,
  explosion: 2,
  projectileFire: 0.5,
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

// A band whose densest window scores below this fraction of the strongest band is dropped, so the
// montage never cuts to a lull (a near-static frame that reads as an accidental clip).
const MIN_BAND_FRACTION = 0.25;

/**
 * The start ticks of the densest weighted-activity window (length `windowTicks`) in each of `count`
 * equal TIME BANDS spanning the back `backFraction` of the fight — so the montage clips come from
 * DIFFERENT phases of the battle (visually distinct), not adjacent near-identical moments. Bands with
 * too little action (< MIN_BAND_FRACTION of the strongest) are dropped rather than shown as a lull.
 * Returned in DESCENDING intensity order (biggest first). All windows are bounded to the fight
 * (< durationTicks), so a clip never includes the outro / winner card. Falls back to a single
 * ~70%-of-duration window when there's no scored activity.
 */
export function peakActionWindows(
  log: BattleLog,
  windowTicks: number,
  count: number,
  backFraction = 0.6,
): number[] {
  const dur = log.durationTicks;
  if (dur <= 0 || count <= 0) return [];
  const w = Math.max(1, Math.min(Math.round(windowTicks), dur));
  const lastStart = Math.max(0, dur - w);

  const mass = new Float64Array(dur);
  for (const e of log.events) {
    if (e.tick < 0 || e.tick >= dur) continue;
    const wt = EVENT_WEIGHT[e.type] ?? 0;
    if (wt) mass[e.tick]! += wt;
  }
  const prefix = new Float64Array(dur + 1);
  for (let i = 0; i < dur; i++) prefix[i + 1] = prefix[i]! + mass[i]!;

  const searchStart = Math.min(Math.floor(dur * (1 - clamp01(backFraction))), lastStart);
  const span = lastStart - searchStart;

  // Densest window start in [lo, hi] (clamped to the searchable range).
  const bestInBand = (lo: number, hi: number): { start: number; score: number } => {
    const a = Math.max(searchStart, lo);
    const b = Math.min(lastStart, hi);
    let best = -1;
    let start = -1;
    for (let s = a; s <= b; s++) {
      const sum = prefix[s + w]! - prefix[s]!;
      if (sum > best) { best = sum; start = s; }
    }
    return { start, score: Math.max(0, best) };
  };

  const bands: Array<{ start: number; score: number }> = [];
  for (let bnd = 0; bnd < count; bnd++) {
    const lo = searchStart + Math.floor((span * bnd) / count);
    const hi = bnd === count - 1 ? lastStart : searchStart + Math.floor((span * (bnd + 1)) / count);
    const band = bestInBand(lo, hi);
    if (band.start >= 0) bands.push(band);
  }

  const maxScore = bands.reduce((m, b) => Math.max(m, b.score), 0);
  if (maxScore <= 0) return [Math.min(Math.floor(dur * 0.7), lastStart)];

  const picks = bands.filter((b) => b.score >= MIN_BAND_FRACTION * maxScore && b.score > 0);
  picks.sort((a, b) => b.score - a.score); // descending intensity
  return picks.map((p) => p.start);
}

/** Start tick of the single densest peak window (back-portion). Convenience over peakActionWindows. */
export function peakActionTick(log: BattleLog, windowTicks: number, backFraction = 0.6): number {
  return peakActionWindows(log, windowTicks, 1, backFraction)[0] ?? 0;
}

export interface OpeningSequence {
  /** Output order of frame indices to show: [clip1…, clip2…, …, 0, 1, …, totalFrames-1]. */
  order: number[];
  /** Index in `order` where the real battle (t=0) begins; 0 when there's no teaser. HUD is hidden for
   *  every position before this. */
  cutAt: number;
  /** Positions in `order` that are HARD CUTS (start of each montage clip + the cut to t=0). Cosmetic
   *  FX are reset at each so the cut lands clean (no particles bleeding across a scene change). */
  cutPoints: number[];
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i < end; i++) out.push(i);
  return out;
}

/**
 * Build the output frame order: a rapid multi-cut flash-forward montage (escalating to the most
 * intense moment), then a hard cut to the full battle from t=0. The teaser is omitted (identity
 * order) when disabled or when the fight is too short to spare a clean teaser. Clip frames are
 * clamped to the fight length AND the captured-frame count (so `--maxframes` smoke renders never
 * index past the end). With fewer distinct peaks than `cuts`, it simply uses as many as it finds.
 */
export function buildOpeningSequence(
  log: BattleLog,
  totalFrames: number,
  cfg: OpeningConfig = DEFAULT_OPENING,
): OpeningSequence {
  const cuts = Math.max(1, Math.round(cfg.cuts));
  const clipFrames = Math.max(1, Math.round((cfg.clipMs / 1000) * cfg.fps));
  const dur = log.durationTicks;
  const limit = Math.min(dur, totalFrames); // a clip can't index past the fight or captured frames
  const identity: OpeningSequence = { order: range(0, totalFrames), cutAt: 0, cutPoints: [] };

  // Skip the teaser when disabled, degenerate, or the fight is too short to spare one cleanly (it
  // needs room for `cuts` clips from the back portion plus the battle itself).
  if (!cfg.enabled || clipFrames < 1 || limit < clipFrames * (cuts + 1)) return identity;

  // Distinct peaks, descending intensity → reverse to ESCALATE (biggest moment lands last, right
  // before the hard cut to the battle start).
  const starts = peakActionWindows(log, clipFrames, cuts, cfg.peakBackFraction).slice().reverse();

  const teaser: number[] = [];
  const cutPoints: number[] = [];
  for (const st of starts) {
    const start = Math.min(st, Math.max(0, limit - clipFrames));
    const end = Math.min(start + clipFrames, limit);
    if (end <= start) continue;
    cutPoints.push(teaser.length); // position in `order` where this clip begins (a hard cut)
    for (let i = start; i < end; i++) teaser.push(i);
  }
  if (teaser.length === 0) return identity;

  const cutAt = teaser.length;
  cutPoints.push(cutAt); // the hard cut to t=0
  return { order: [...teaser, ...range(0, totalFrames)], cutAt, cutPoints };
}
