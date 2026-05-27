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

const PARTICLE_LIFE = 16; // ports prototype `life: 16, maxLife: 16`

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

  spawn(x: number, y: number, team: number, n = 5): void {
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= this.cap) break;
      this.particles.push({
        x,
        y,
        vx: (this.prng() - 0.5) * 4,
        vy: (this.prng() - 0.5) * 4,
        life: PARTICLE_LIFE,
        maxLife: PARTICLE_LIFE,
        team,
      });
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
