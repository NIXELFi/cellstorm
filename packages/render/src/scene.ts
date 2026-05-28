// PixiJS (WebGL) scene. Draws the sim world each frame: per-team batched cell fills (sized
// by hp like the prototype), projectiles, and cosmetic particles. A low-alpha background
// rect is painted each frame to leave motion trails (port of the prototype's
// `ctx.fillStyle = 'rgba(6,4,14,0.55)'; ctx.fillRect(...)`).
//
// Resolution-independent: the scene works in LOGICAL arena coordinates (e.g. 280x498) and
// applies a single `scale` factor so identical code composites at 280x498 (preview) and
// 2160x3840 (4K). The caller owns the Application; we only attach a container to its stage.
//
// NOT unit-tested (needs WebGL/DOM) — verified in the harness.

import { Application, Container, Graphics } from "pixi.js";
import type { ArenaParams, World } from "@cellstorm/sim";
import { THEME, type Theme } from "./theme";
import type { ParticleField } from "./fx";

export interface SceneOptions {
  /** Logical arena (unscaled), e.g. 280x498. */
  arena: ArenaParams;
  /** Multiply logical coords by this for the target resolution (preview 1, 4K ~7.7). */
  scale: number;
  theme?: Theme;
}

export class PixiScene {
  readonly root = new Container();
  private readonly trail = new Graphics();
  private readonly cellLayer = new Graphics();
  private readonly projLayer = new Graphics();
  private readonly particleLayer = new Graphics();
  private readonly arena: ArenaParams;
  private readonly scale: number;
  private readonly theme: Theme;

  constructor(app: Application, opts: SceneOptions) {
    this.arena = opts.arena;
    this.scale = opts.scale;
    this.theme = opts.theme ?? THEME;
    // Draw order: trails (oldest) -> cells -> projectiles -> particles (on top).
    this.root.addChild(this.trail, this.cellLayer, this.projLayer, this.particleLayer);
    app.stage.addChild(this.root);
    // Paint an opaque background once so the first frame isn't transparent.
    this.trail
      .rect(0, 0, this.arena.width * this.scale, this.arena.height * this.scale)
      .fill({ color: this.theme.background, alpha: 1 });
  }

  /** Render one frame of world + cosmetic particles. */
  draw(world: World, particles?: ParticleField): void {
    const s = this.scale;
    const W = this.arena.width * s;
    const H = this.arena.height * s;

    // Trail/clear pass: low-alpha background rect leaves fading trails (prototype 0.55).
    this.trail.clear();
    this.trail.rect(0, 0, W, H).fill({ color: this.theme.background, alpha: 0.55 });

    // Cells: one batched fill per team, radius scaled by hp fraction (prototype formula).
    this.cellLayer.clear();
    const teamCount = world.cfg.teamCount;
    for (let t = 0; t < teamCount; t++) {
      let any = false;
      for (const c of world.cells) {
        if (!c.alive || c.team !== t) continue;
        const r = c.radius * (0.55 + 0.45 * (c.hp / c.maxHp)) * s;
        this.cellLayer.circle(c.x * s, c.y * s, r);
        any = true;
      }
      if (any) this.cellLayer.fill({ color: this.teamColor(t), alpha: 1 });
    }

    // Projectiles: batched per team, fixed small radius (prototype r=2).
    this.projLayer.clear();
    for (let t = 0; t < teamCount; t++) {
      let any = false;
      for (const p of world.projectiles) {
        if (p.team !== t) continue;
        this.projLayer.circle(p.x * s, p.y * s, 2 * s);
        any = true;
      }
      if (any) this.projLayer.fill({ color: this.teamColor(t), alpha: 1 });
    }

    // Cosmetic particles: team-tinted, alpha by remaining life (prototype r=1.8).
    this.particleLayer.clear();
    if (particles) {
      for (const pt of particles.particles) {
        this.particleLayer
          .circle(pt.x * s, pt.y * s, 1.8 * s)
          .fill({ color: this.teamColor(pt.team), alpha: pt.life / pt.maxLife });
      }
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }

  private teamColor(team: number): number {
    const t = this.theme.teams[team % this.theme.teams.length];
    return t ? t.color : 0xffffff;
  }
}
