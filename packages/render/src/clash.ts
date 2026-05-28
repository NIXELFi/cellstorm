// Cosmetic IMPACT SPARKS at "clash fronts". There is NO collision event in the sim data, so
// clashes are detected PURELY from the drawn cell positions each frame (deterministic draw data,
// never the gameplay PRNG). A pair of ALIVE cells from DIFFERENT teams whose centers are within
// (rA+rB)*radiusFactor are pressing against each other → emit brief bright sparks at the midpoint.
//
// Pure logic — no Pixi imports — so `findClashes` is unit-testable in isolation. The only
// randomness (spark jitter / spawn probability) lives in player.ts and uses the cosmetic PRNG.
//
// Performance: a UNIFORM SPATIAL GRID makes detection ~O(n) for up to ~900 cells (bucket each cell
// by floor(x/gridCell),floor(y/gridCell), then test only the cell's bucket + 8 neighbors). The
// result is capped at maxPerFrame so it never spams the particle pool.

/** All clash tuning knobs in one place — no scattered magic numbers. */
export const CLASH_TUNING = {
  /** Master toggle for the whole effect. */
  enabled: true,
  /** Contact when center distance < (rA + rB) * radiusFactor (>1 = a little reach). */
  radiusFactor: 1.15,
  /** Uniform grid bucket size in LOGICAL arena units. ~2x a cell diameter keeps buckets small. */
  gridCell: 14,
  /** Hard cap on clash points emitted per frame (bounds spark spawns). */
  maxPerFrame: 14,
  /** Per clash point, chance to actually spawn a burst (cosmetic PRNG gated). */
  spawnProbability: 0.5,
  /** Particles per spark burst. */
  sparkCount: 3,
  /** Spark velocity magnitude (fast). */
  sparkSpeed: 6,
  /** Spark lifetime in frames (short-lived). */
  sparkLife: 7,
  /** Drawn spark core size in LOGICAL units (small, scaled by scene.scale at draw time). */
  sparkSize: 1.1,
};

export type ClashTuning = typeof CLASH_TUNING;

/** Minimal cell shape used by clash detection — testable without the full World. */
export interface ClashCell {
  x: number;
  y: number;
  team: number;
  radius: number;
  alive: boolean;
}

export interface ClashPoint {
  x: number;
  y: number;
}

export interface FindClashesOpts {
  radiusFactor: number;
  gridCell: number;
  maxPerFrame: number;
}

/**
 * Find clash midpoints between ALIVE cells of DIFFERENT teams whose centers are within
 * (rA + rB) * radiusFactor. Uses a uniform spatial grid (cell bucket + 8 neighbors) so it is
 * ~O(n) rather than O(n^2). Returns at most `maxPerFrame` midpoints. Pure / deterministic.
 */
export function findClashes(cells: readonly ClashCell[], opts: FindClashesOpts): ClashPoint[] {
  const { radiusFactor, gridCell, maxPerFrame } = opts;
  const out: ClashPoint[] = [];
  if (maxPerFrame <= 0 || gridCell <= 0) return out;

  // Bucket only alive cells by grid coordinate. Key: integer-packed (gx, gy).
  const grid = new Map<number, number[]>(); // key -> indices into `live`
  const live: ClashCell[] = [];
  for (const c of cells) {
    if (!c.alive) continue;
    const idx = live.length;
    live.push(c);
    const gx = Math.floor(c.x / gridCell);
    const gy = Math.floor(c.y / gridCell);
    const key = cellKey(gx, gy);
    const bucket = grid.get(key);
    if (bucket) bucket.push(idx);
    else grid.set(key, [idx]);
  }

  // For each cell, look at its bucket + 8 neighbor buckets. To avoid testing each pair twice,
  // only consider a neighbor index j > i.
  for (let i = 0; i < live.length; i++) {
    if (out.length >= maxPerFrame) break;
    const a = live[i]!;
    const gx = Math.floor(a.x / gridCell);
    const gy = Math.floor(a.y / gridCell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(cellKey(gx + dx, gy + dy));
        if (!bucket) continue;
        for (const j of bucket) {
          if (j <= i) continue; // each unordered pair tested once
          const b = live[j]!;
          if (b.team === a.team) continue;
          const ddx = b.x - a.x;
          const ddy = b.y - a.y;
          const reach = (a.radius + b.radius) * radiusFactor;
          if (ddx * ddx + ddy * ddy < reach * reach) {
            out.push({ x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 });
            if (out.length >= maxPerFrame) return out;
          }
        }
      }
    }
  }
  return out;
}

/** Pack two (possibly negative) grid coords into one number key for the bucket Map. */
function cellKey(gx: number, gy: number): number {
  // Offset to keep coords non-negative, then pack. 0x8000 (32768) buckets per axis is plenty for a
  // small arena; values are bounded so collisions across distinct (gx,gy) cannot occur in practice.
  return (gx + 0x8000) * 0x10000 + (gy + 0x8000);
}
