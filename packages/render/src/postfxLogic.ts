// Pure math for the post-FX layer — kept separate from the Pixi wiring (which needs WebGL) so the
// reactive behavior is unit-testable. Everything here is a deterministic function of the sim tick /
// event log, so the FX render identically in the harness (rAF) and the headless renderer (per-tick).

import type { SimEvent } from "@cellstorm/sim";

/** Impulse contribution of the events that fired on a single tick (0..1). Explosions punch hardest. */
export function impactFromEvents(events: SimEvent[]): number {
  let v = 0;
  for (const e of events) {
    if (e.type === "explosion") v += 0.5;
    else if (e.type === "death") v += 0.12;
  }
  return v > 1 ? 1 : v;
}

/** New impact level: decay the previous level and add this tick's impulse, clamped to [0,1]. */
export function decayImpact(prev: number, added: number, decay: number): number {
  const v = prev * decay + added;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Winner-flash intensity (0..1): a bright pop at the resolve frame that decays to 0 over `windowSec`.
 * Zero until the battle has resolved (`resolvedFrame >= 0` and we've reached it).
 */
export function winnerFlash(frame: number, resolvedFrame: number, fps: number, windowSec: number): number {
  if (resolvedFrame < 0 || frame < resolvedFrame) return 0;
  const elapsed = (frame - resolvedFrame) / fps;
  if (elapsed >= windowSec) return 0;
  return 1 - elapsed / windowSec;
}

/** Deterministic 2D screen-shake offset for a tick, bounded by `magnitude` px. */
export function shakeOffset(tick: number, magnitude: number): { dx: number; dy: number } {
  if (magnitude <= 0) return { dx: 0, dy: 0 };
  // A single rotating direction (so |offset| = r <= magnitude) with a tick-varying radius — smooth,
  // deterministic, no PRNG / wall clock.
  const ang = tick * 2.399963; // golden-angle-ish step for a non-repeating direction
  const wobble = 0.5 + 0.5 * Math.sin(tick * 1.7);
  const r = magnitude * wobble;
  return { dx: Math.cos(ang) * r, dy: Math.sin(ang) * r };
}

/** Map an impact level (0..1) to a chromatic-aberration offset in pixels, clamped to [base, max]. */
export function aberrationPixels(impact: number, base: number, max: number): number {
  const i = impact < 0 ? 0 : impact > 1 ? 1 : impact;
  return base + (max - base) * i;
}
