// PixiJS (WebGL) scene. Draws the sim world each frame with per-power visual identity:
//   - team color is the primary read; the cell SHAPE conveys the team's power archetype
//   - a soft glow layer under the cells for a neon look
//   - state-driven FX read straight from deterministic world state (cosmetic, no gameplay
//     coupling): charger dash trails, plague-infected tint, stun dim, frenzy heat, heal halos
//   - cosmetic particle bursts (death/explosion) from the player's ParticleField
//
// Resolution-independent: works in LOGICAL arena coords and applies one `scale` factor so the
// same code composites at 280x498 (preview) and 2160x3840 (4K). NOT unit-tested (needs WebGL).

import { Application, Container, Graphics } from "pixi.js";
import type { ArenaParams, World } from "@cellstorm/sim";
import { THEME, type Theme } from "./theme";
import type { ParticleField } from "./fx";
import { addShape, powerStyle, type PowerStyle } from "./glyphs";
import { ACTION_ZOOM, actionTransform } from "./safeArea";

const HEAL = 0x6ef0a0;
const POISON = 0x7fe04a;
const HOT = 0xff5a3c;
const WHITE = 0xffffff;

export interface SceneOptions {
  arena: ArenaParams;
  scale: number;
  theme?: Theme;
}

export class PixiScene {
  readonly root = new Container();
  private readonly trail = new Graphics();
  private readonly glowLayer = new Graphics();
  private readonly cellLayer = new Graphics();
  private readonly projLayer = new Graphics();
  private readonly fxLayer = new Graphics();
  private readonly particleLayer = new Graphics();
  private readonly arena: ArenaParams;
  private readonly scale: number;
  private readonly theme: Theme;
  private styles: PowerStyle[] = [];

  constructor(app: Application, opts: SceneOptions) {
    this.arena = opts.arena;
    this.scale = opts.scale;
    this.theme = opts.theme ?? THEME;
    // Draw order: trails -> glow -> cells -> projectiles -> state FX -> particles (top).
    this.root.addChild(
      this.trail, this.glowLayer, this.cellLayer, this.projLayer, this.fxLayer, this.particleLayer,
    );
    app.stage.addChild(this.root);
    // Off-by-default render-side inward scale so the meaningful action stays inside the safe zone.
    // ACTION_ZOOM=0 → identity (full-bleed look + outcomes unchanged); >0 → pull the battle inward
    // (margins fall back to the page background). Purely compositing; never touches the sim.
    if (ACTION_ZOOM > 0) {
      const t = actionTransform(this.arena.width * this.scale, this.arena.height * this.scale, ACTION_ZOOM);
      this.root.scale.set(t.scale);
      this.root.position.set(t.x, t.y);
    }
    this.trail
      .rect(0, 0, this.arena.width * this.scale, this.arena.height * this.scale)
      .fill({ color: this.theme.background, alpha: 1 });
  }

  draw(world: World, particles?: ParticleField): void {
    const s = this.scale;
    const W = this.arena.width * s;
    const H = this.arena.height * s;
    const teamCount = world.cfg.teamCount;
    if (this.styles.length !== teamCount) {
      this.styles = world.cfg.powers.map((p) => powerStyle(p));
    }

    // Trail/clear pass: low-alpha background leaves fading motion trails.
    this.trail.clear();
    this.trail.rect(0, 0, W, H).fill({ color: this.theme.background, alpha: 0.5 });

    // Glow layer: a larger faint shape under each cell (cheap bloom), batched per team.
    this.glowLayer.clear();
    for (let t = 0; t < teamCount; t++) {
      const shape = this.styles[t]!.shape;
      let any = false;
      for (const c of world.cells) {
        if (!c.alive || c.team !== t) continue;
        addShape(this.glowLayer, shape, c.x * s, c.y * s, this.cellR(c) * s * 2.1);
        any = true;
      }
      if (any) this.glowLayer.fill({ color: this.teamColor(t), alpha: 0.14 });
    }

    // Cell layer: shape per team power, filled in team color with a crisp dark outline so
    // individual shapes stay legible inside same-color blobs. Batched per team.
    this.cellLayer.clear();
    for (let t = 0; t < teamCount; t++) {
      const shape = this.styles[t]!.shape;
      let any = false;
      for (const c of world.cells) {
        if (!c.alive || c.team !== t) continue;
        addShape(this.cellLayer, shape, c.x * s, c.y * s, this.cellR(c) * s);
        any = true;
      }
      if (any) {
        // Subtle outline — just enough to separate cells in a blob, not a heavy edge.
        this.cellLayer
          .fill({ color: this.teamColor(t), alpha: 1 })
          .stroke({ width: Math.max(0.4, 0.55 * s), color: this.darken(this.teamColor(t), 0.55), alpha: 0.5 });
      }
    }

    // Projectiles: faint team-colored glow + bright white core.
    this.projLayer.clear();
    for (let t = 0; t < teamCount; t++) {
      let any = false;
      for (const p of world.projectiles) {
        if (p.team !== t) continue;
        this.projLayer.circle(p.x * s, p.y * s, 4 * s);
        any = true;
      }
      if (any) this.projLayer.fill({ color: this.teamColor(t), alpha: 0.3 });
    }
    for (const p of world.projectiles) {
      this.projLayer.circle(p.x * s, p.y * s, 1.6 * s).fill({ color: WHITE, alpha: 0.95 });
    }

    // State-driven FX overlays (per-cell, only affected cells — cheap).
    this.fxLayer.clear();
    for (let t = 0; t < teamCount; t++) {
      const style = this.styles[t]!;
      for (const c of world.cells) {
        if (!c.alive || c.team !== t) continue;
        const r = this.cellR(c) * s;
        const cx = c.x * s, cy = c.y * s;
        const hpFrac = c.hp / c.maxHp;

        if (c.dash > 0) {
          const k = 6 * s;
          this.fxLayer
            .moveTo(cx, cy)
            .lineTo(cx - c.vx * k, cy - c.vy * k)
            .stroke({ width: r * 0.9, color: WHITE, alpha: 0.5 * (c.dash / 10) });
        }
        if (c.stunT > 0) {
          this.fxLayer.circle(cx, cy, r * 1.1).stroke({ width: 1 * s, color: WHITE, alpha: 0.6 });
          this.fxLayer.circle(cx, cy, r).fill({ color: 0x000000, alpha: 0.35 });
        }
        if (c.plagueT > 0) {
          this.fxLayer.circle(cx, cy, r * 0.7).fill({ color: POISON, alpha: 0.6 });
        }
        if (style.frenzy && hpFrac < 0.9) {
          this.fxLayer
            .circle(cx, cy, r * (0.4 + 0.5 * (1 - hpFrac)))
            .fill({ color: HOT, alpha: 0.35 + 0.4 * (1 - hpFrac) });
        }
        if (style.halo === "heal" && hpFrac < 0.98) {
          this.fxLayer.circle(cx, cy, r * 1.6).stroke({ width: 1.2 * s, color: HEAL, alpha: 0.3 });
        }
        if (style.halo === "shield") {
          this.fxLayer.circle(cx, cy, r * 1.35).stroke({ width: 1 * s, color: WHITE, alpha: 0.22 });
        }
      }
    }

    // Cosmetic particles on top: team-tinted, alpha by remaining life.
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

  private cellR(c: { radius: number; hp: number; maxHp: number }): number {
    // A touch larger than the prototype so shapes read, without dominating.
    return c.radius * (0.62 + 0.45 * (c.hp / c.maxHp)) * 1.15;
  }

  /** Darken a hex color toward black by factor f (0..1) — used for crisp cell outlines. */
  private darken(hex: number, f: number): number {
    const r = Math.round(((hex >> 16) & 0xff) * f);
    const g = Math.round(((hex >> 8) & 0xff) * f);
    const b = Math.round((hex & 0xff) * f);
    return (r << 16) | (g << 8) | b;
  }

  private teamColor(team: number): number {
    const t = this.theme.teams[team % this.theme.teams.length];
    return t ? t.color : 0xffffff;
  }
}
