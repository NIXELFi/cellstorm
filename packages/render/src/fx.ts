// Cosmetic particle FX. CRITICAL DETERMINISM CONTRACT: this module NEVER touches the
// sim's gameplay PRNG (world.prng). All jitter comes from a SEPARATE cosmetic PRNG owned
// by the player and passed in. Tweaking visuals can never change which seeds score well.
//
// Pure logic — no Pixi imports — so it is unit-testable and the scene just reads the
// particle list each frame to draw it.

import type { Prng } from "@cellstorm/sim";

export interface CosmeticParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  team: number;
}

export interface SpawnOpts {
  speed?: number; // base velocity magnitude (default 4)
  ring?: boolean; // emit evenly around a circle (shockwave) instead of random scatter
  life?: number; // override particle lifetime
}

const PARTICLE_LIFE = 16; // ports prototype `life: 16, maxLife: 16`

// ---------------------------------------------------------------------------
// Tunable knobs. All FX magic numbers live here — no scattered constants in
// player.ts / scene.ts. Bigger/brighter than the old dim-dot defaults so kills
// POP (the bloom post-FX further amplifies the white-hot core/flash).
// ---------------------------------------------------------------------------

export interface FlashTune {
  radiusStart: number; // ring radius (logical units) at spawn
  radiusEnd: number; // ring radius when the flash dies (expands outward)
  life: number; // frames the flash lives
  ringWidth: number; // stroke width of the expanding ring (logical units)
  coreAlpha: number; // alpha of the bright center "pop" at spawn
}

/** Death/explosion FLASH sizing. Explosion is bigger/longer than a plain death. */
export const FLASH_TUNING: { death: FlashTune; explosion: FlashTune } = {
  // Toned down per review: smaller, dimmer, shorter — a subtle pop, not a big ring.
  death: { radiusStart: 4, radiusEnd: 11, life: 8, ringWidth: 1.3, coreAlpha: 0.5 },
  explosion: { radiusStart: 7, radiusEnd: 26, life: 12, ringWidth: 2, coreAlpha: 0.7 },
};

/** Death/explosion particle BURST tuning (counts, speed, life, size, white-core fraction). */
export const BURST_TUNING = {
  deathCount: 7, // punchier than the original 5, but restrained
  glasshammerCount: 12, // Glasshammer shatter
  explosionCount: 22,
  speed: 5, // base burst velocity (was 4), a touch faster
  glasshammerSpeed: 8, // shards fly faster
  explosionSpeed: 7,
  life: 16, // base particle life
  glasshammerLife: 22,
  explosionLife: 20,
  size: 1.9, // base particle radius in logical units (near the original 1.8)
  coreFrac: 0.5, // while life/maxLife >= this, draw a white-hot core
  coreScale: 0.5, // core radius as a fraction of the particle radius
};

export interface Flash {
  x: number;
  y: number;
  team: number;
  life: number;
  maxLife: number;
  big: boolean; // explosion (true) vs death (false) — selects FLASH_TUNING bucket
}

export interface FlashSpawnOpts {
  big?: boolean; // explosion flash (bigger/longer) when true
}

export interface FlashVisual {
  radius: number; // current ring radius (logical units) — GROWS as life decreases
  alpha: number; // current alpha — FADES to 0 as life decreases
}

/**
 * PURE, unit-testable mapping of a flash's age to its current visual state. As `life`
 * counts down from `maxLife` to 0 the ring radius grows (radiusStart -> radiusEnd) and
 * the alpha fades (1 -> 0). `big` selects the explosion tuning (larger than death).
 * Fully deterministic from its inputs — no PRNG, no wall-clock.
 */
export function flashVisual(
  life: number,
  maxLife: number,
  big: boolean,
  tuning: { death: FlashTune; explosion: FlashTune } = FLASH_TUNING,
): FlashVisual {
  const tune = big ? tuning.explosion : tuning.death;
  // t: 0 at spawn (life == maxLife) -> 1 at death (life == 0). Clamp for safety.
  const denom = maxLife > 0 ? maxLife : 1;
  const t = Math.min(1, Math.max(0, 1 - life / denom));
  const radius = tune.radiusStart + (tune.radiusEnd - tune.radiusStart) * t;
  const alpha = 1 - t; // linear fade out
  return { radius, alpha };
}

/**
 * A cosmetic FLASH pool: a bright expanding ring + brief center pop emitted on each death
 * and explosion. Parallels ParticleField but flashes are fully deterministic from their
 * spawn (no jitter), so no PRNG is needed. Decoupled from the sim — purely cosmetic.
 */
export class FlashField {
  readonly flashes: Flash[] = [];
  private readonly cap: number;

  constructor(cap = 512) {
    this.cap = cap;
  }

  spawn(x: number, y: number, team: number, opts?: FlashSpawnOpts): void {
    if (this.flashes.length >= this.cap) return;
    const big = opts?.big ?? false;
    const life = (big ? FLASH_TUNING.explosion : FLASH_TUNING.death).life;
    this.flashes.push({ x, y, team, life, maxLife: life, big });
  }

  /** Age one frame; swap-remove dead flashes. */
  advance(): void {
    const fs = this.flashes;
    for (let i = fs.length - 1; i >= 0; i--) {
      const f = fs[i]!;
      f.life--;
      if (f.life <= 0) {
        fs[i] = fs[fs.length - 1]!;
        fs.pop();
      }
    }
  }

  clear(): void {
    this.flashes.length = 0;
  }
}

/**
 * A cosmetic particle pool seeded by a cosmetic PRNG (NOT the sim PRNG). Death/explosion/
 * projectile events spawn bursts; `advance()` integrates and reaps. Deterministic for a
 * given cosmetic seed, but entirely decoupled from sim outcomes.
 */
export class ParticleField {
  readonly particles: CosmeticParticle[] = [];
  private readonly prng: Prng;
  private readonly cap: number;

  constructor(prng: Prng, cap = 2000) {
    this.prng = prng;
    this.cap = cap;
  }

  spawn(x: number, y: number, team: number, n = 5, opts?: SpawnOpts): void {
    const speed = opts?.speed ?? 4;
    const life = opts?.life ?? PARTICLE_LIFE;
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= this.cap) break;
      let vx: number, vy: number;
      if (opts?.ring) {
        // Even radial burst (shockwave). Jitter the speed a touch via the cosmetic PRNG.
        const a = (i / n) * Math.PI * 2;
        const sp = speed * (0.85 + this.prng() * 0.3);
        vx = Math.cos(a) * sp;
        vy = Math.sin(a) * sp;
      } else {
        vx = (this.prng() - 0.5) * speed * 2;
        vy = (this.prng() - 0.5) * speed * 2;
      }
      this.particles.push({ x, y, vx, vy, life, maxLife: life, team });
    }
  }

  /** Integrate one frame; swap-remove dead particles (matches prototype damping 0.9). */
  advance(): void {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]!;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.9;
      p.vy *= 0.9;
      p.life--;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1]!;
        ps.pop();
      }
    }
  }

  clear(): void {
    this.particles.length = 0;
  }
}
