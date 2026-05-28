// PURE motion-trail geometry. A moving cell leaves a short tapered "comet" streak pointing OPPOSITE
// its velocity: faster -> longer + brighter; stationary -> nothing. The streak is built entirely from
// the cosmetic per-tick velocity (c.vx/c.vy) that the scene already draws elsewhere — it never touches
// the sim or RNG, so it's deterministic and unit-testable with no Pixi/WebGL.
//
// Units: x/y/vx/vy/headWidth are LOGICAL arena coords (the cell visual radius is ~3-4 logical units,
// velocities ~0.15-2.5/tick). The function applies the global `scale` so the returned quads are already
// in canvas space and can be fed straight to Graphics.poly(...).

export interface TrailTuning {
  /** Below this speed (logical units/tick) a cell draws no trail. */
  minSpeed: number;
  /** Logical trail length per unit of speed. */
  lengthPerSpeed: number;
  /** Hard cap on trail length (logical units). */
  maxLength: number;
  /** Multiplier the CALLER applies to the cell visual radius to get the `headWidth` arg (the
   *  function uses `headWidth` directly; this knob lives here so all trail tuning is in one place). */
  headWidthFrac: number;
  /** Number of tapered quad segments from head -> tail. */
  segments: number;
  /** Base overall alpha for a barely-moving cell. */
  baseAlpha: number;
  /** Extra overall alpha per unit of speed. */
  alphaSpeedScale: number;
  /** Ceiling on overall alpha. */
  maxAlpha: number;
}

export const TRAIL_TUNING: TrailTuning = {
  minSpeed: 0.15,
  lengthPerSpeed: 6,
  maxLength: 28,
  headWidthFrac: 0.85,
  segments: 4,
  baseAlpha: 0.5,
  alphaSpeedScale: 0.12,
  maxAlpha: 0.7,
};

export interface TrailQuads {
  /** One quad per segment, head -> tail. Each quad is 8 numbers (4 xy points), in canvas space. */
  quads: number[][];
  /** Per-segment alpha, fading head -> tail. */
  alphas: number[];
}

/**
 * Build the comet streak for one cell. The streak runs from the cell head (full `headWidth`,
 * positioned at the cell center) back along `-velocity` to a point at the tail (zero width), split
 * into `tuning.segments` quads. Returns `null` when the cell is moving slower than `minSpeed`.
 *
 * Geometry is a triangle fan flattened into quads: for segment k (0 = head), the near edge is at
 * distance `length * k/segments` behind the head with width `headWidth * (1 - k/segments)`, and the
 * far edge at `(k+1)/segments` with width `headWidth * (1 - (k+1)/segments)`. The final segment's far
 * edge collapses to the tail point. Each quad is multiplied by `scale` into canvas coordinates.
 *
 * Alpha: `overall = min(maxAlpha, baseAlpha + speed*alphaSpeedScale)`; segment k carries
 * `overall * (1 - k/segments)`, so it fades toward the tail.
 */
export function trailQuads(
  x: number,
  y: number,
  vx: number,
  vy: number,
  headWidth: number,
  scale: number,
  tuning: TrailTuning = TRAIL_TUNING,
): TrailQuads | null {
  const speed = Math.hypot(vx, vy);
  if (speed < tuning.minSpeed) return null;

  // Unit vector along the direction of travel; the trail extends opposite (-dir).
  const dirX = vx / speed;
  const dirY = vy / speed;
  // Perpendicular unit vector for the streak width.
  const perpX = -dirY;
  const perpY = dirX;

  const length = Math.min(speed * tuning.lengthPerSpeed, tuning.maxLength);
  // `headWidth` is already the intended full head width (the caller multiplied the cell radius by
  // `headWidthFrac`); use it directly so the factor isn't applied twice.
  const halfW = headWidth / 2;
  const overall = Math.min(tuning.maxAlpha, tuning.baseAlpha + speed * tuning.alphaSpeedScale);
  const segs = tuning.segments;

  const quads: number[][] = [];
  const alphas: number[] = [];

  for (let k = 0; k < segs; k++) {
    const tNear = k / segs;
    const tFar = (k + 1) / segs;
    // Distance behind the head (negative = along -dir).
    const dNear = length * tNear;
    const dFar = length * tFar;
    // Width tapers linearly to 0 at the tail.
    const wNear = halfW * (1 - tNear);
    const wFar = halfW * (1 - tFar);

    // Centerline points behind the head.
    const nx = x - dirX * dNear;
    const ny = y - dirY * dNear;
    const fx = x - dirX * dFar;
    const fy = y - dirY * dFar;

    // Quad: near-left, near-right, far-right, far-left (canvas space).
    quads.push([
      (nx + perpX * wNear) * scale, (ny + perpY * wNear) * scale,
      (nx - perpX * wNear) * scale, (ny - perpY * wNear) * scale,
      (fx - perpX * wFar) * scale, (fy - perpY * wFar) * scale,
      (fx + perpX * wFar) * scale, (fy + perpY * wFar) * scale,
    ]);
    alphas.push(overall * (1 - tNear));
  }

  return { quads, alphas };
}
