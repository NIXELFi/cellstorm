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
import { type ParticleField, type FlashField, flashVisual, BURST_TUNING, FLASH_TUNING } from "./fx";
import { powerStyle, type PowerStyle } from "./glyphs";
import { ACTION_ZOOM, actionTransform } from "./safeArea";
import { TRAIL_TUNING, trailQuads } from "./trail";
import { CLASH_TUNING } from "./clash";
import { drawBackground } from "./background";

const HEAL = 0x6ef0a0;
const POISON = 0x7fe04a;
const HOT = 0xff5a3c;
const WHITE = 0xffffff;

export interface SceneOptions {
  arena: ArenaParams;
  scale: number;
  theme?: Theme;
  /** Arena background pattern (see background.ts). Defaults to the flat fill. */
  backgroundStyle?: string;
}

export class PixiScene {
  readonly root = new Container();
  private readonly trail = new Graphics();
  private readonly streakLayer = new Graphics();
  private readonly glowLayer = new Graphics();
  private readonly cellLayer = new Graphics();
  private readonly projLayer = new Graphics();
  private readonly fxLayer = new Graphics();
  private readonly particleLayer = new Graphics();
  private readonly flashLayer = new Graphics();
  private readonly sparkLayer = new Graphics();
  private readonly arena: ArenaParams;
  private readonly scale: number;
  private readonly theme: Theme;
  private readonly bgStyle: string;
  private styles: PowerStyle[] = [];

  constructor(app: Application, opts: SceneOptions) {
    this.arena = opts.arena;
    this.scale = opts.scale;
    this.theme = opts.theme ?? THEME;
    this.bgStyle = opts.backgroundStyle ?? "anim-parallax";
    // Draw order (bottom -> top): background -> motion streaks -> glow -> cells -> projectiles ->
    // state FX -> particles (white-hot bursts) -> kill-flash rings -> clash sparks. The streak layer
    // sits above the background but BELOW the cells so each cell rides the head of its own trail;
    // flashes + sparks sit on top so they read brightest and the bloom post-FX amplifies them. All
    // layers live inside the scene container, so the bloom post-FX makes them glow.
    this.root.addChild(
      this.trail, this.streakLayer, this.glowLayer, this.cellLayer, this.projLayer, this.fxLayer,
      this.particleLayer, this.flashLayer, this.sparkLayer,
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
    drawBackground(this.trail, this.bgStyle, this.arena.width * this.scale, this.arena.height * this.scale, this.theme, 1);
  }

  draw(world: World, particles?: ParticleField, flashes?: FlashField, sparks?: ParticleField): void {
    const s = this.scale;
    const W = this.arena.width * s;
    const H = this.arena.height * s;
    const teamCount = world.cfg.teamCount;
    if (this.styles.length !== teamCount) {
      this.styles = world.cfg.powers.map((p) => powerStyle(p));
    }

    // Trail/clear pass: low-alpha background leaves fading motion trails. Drawing the (optional)
    // background pattern here at the same alpha keeps the trail fade intact — cells fade toward the
    // pattern instead of flat black.
    this.trail.clear();
    drawBackground(this.trail, this.bgStyle, W, H, this.theme, 0.5, world.frame);

    // Motion streaks: a tapered, team-colored comet behind each MOVING cell, opposite its velocity.
    // Faster cells get a longer/brighter streak; stationary cells get none. Batched per (team, segment)
    // so each fill covers many cells: the per-segment alpha is constant (representative), while the
    // per-cell trail LENGTH carries the speed differences. Sits below the cells (cell rides the head).
    this.streakLayer.clear();
    const segs = TRAIL_TUNING.segments;
    for (let t = 0; t < teamCount; t++) {
      for (let k = 0; k < segs; k++) {
        let any = false;
        let segAlpha = 0;
        for (const c of world.cells) {
          if (!c.alive || c.team !== t) continue;
          const tr = trailQuads(c.x, c.y, c.vx, c.vy, this.cellR(c) * TRAIL_TUNING.headWidthFrac, s);
          if (!tr) continue;
          this.streakLayer.poly(tr.quads[k]!);
          segAlpha = tr.alphas[k]!; // per-segment alpha is independent of the cell; last wins, all equal
          any = true;
        }
        if (any) this.streakLayer.fill({ color: this.teamColor(t), alpha: segAlpha });
      }
    }

    // Glow layer: a larger faint disc under each cell (cheap neon bloom), batched per team.
    this.glowLayer.clear();
    for (let t = 0; t < teamCount; t++) {
      let any = false;
      for (const c of world.cells) {
        if (!c.alive || c.team !== t) continue;
        this.glowLayer.circle(c.x * s, c.y * s, this.cellR(c) * s * 2.1);
        any = true;
      }
      if (any) this.glowLayer.fill({ color: this.teamColor(t), alpha: 0.14 });
    }

    // Cell layer: every cell is a flat 2D circle in team color with a crisp dark outline so
    // individual cells stay legible inside same-color blobs. Batched per team.
    this.cellLayer.clear();
    for (let t = 0; t < teamCount; t++) {
      let any = false;
      for (const c of world.cells) {
        if (!c.alive || c.team !== t) continue;
        this.cellLayer.circle(c.x * s, c.y * s, this.cellR(c) * s);
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

    // Cosmetic particles: team-tinted body, alpha by remaining life, with a WHITE-HOT core for
    // fresh particles that fades to pure team color as they age (punchier kill feedback).
    this.particleLayer.clear();
    if (particles) {
      const baseR = BURST_TUNING.size * s;
      const coreR = baseR * BURST_TUNING.coreScale;
      for (const pt of particles.particles) {
        const lifeFrac = pt.life / pt.maxLife;
        const px = pt.x * s, py = pt.y * s;
        this.particleLayer.circle(px, py, baseR).fill({ color: this.teamColor(pt.team), alpha: lifeFrac });
        // White-hot core while the particle is fresh; its alpha ramps down within the core window.
        if (lifeFrac >= BURST_TUNING.coreFrac) {
          const coreA = (lifeFrac - BURST_TUNING.coreFrac) / (1 - BURST_TUNING.coreFrac);
          this.particleLayer.circle(px, py, coreR).fill({ color: WHITE, alpha: coreA });
        }
      }
    }

    // Kill-flash pass: an expanding ring + brief center pop. Color starts near-white and resolves
    // toward the team color over the flash's life; radius grows + alpha fades (pure helper).
    this.flashLayer.clear();
    if (flashes) {
      for (const f of flashes.flashes) {
        const { radius, alpha } = flashVisual(f.life, f.maxLife, f.big);
        if (alpha <= 0) continue;
        const fx = f.x * s, fy = f.y * s;
        const tune = f.big ? FLASH_TUNING.explosion : FLASH_TUNING.death;
        const ageT = 1 - alpha; // 0 fresh -> 1 dying; whiter when fresh, team color as it ages
        const ringColor = this.lerpColor(WHITE, this.teamColor(f.team), ageT);
        this.flashLayer
          .circle(fx, fy, radius * s)
          .stroke({ width: tune.ringWidth * s, color: ringColor, alpha });
        // Brief bright center "pop" early in the flash's life (fades fast).
        const coreA = tune.coreAlpha * alpha * alpha;
        if (coreA > 0) {
          this.flashLayer.circle(fx, fy, tune.radiusStart * s).fill({ color: WHITE, alpha: coreA });
        }
      }
    }

    // Impact sparks at clash fronts (top): bright white-hot cores with a faint hot halo so they read
    // as energetic clashes distinct from team-tinted particles, and feed the bloom post-FX.
    this.sparkLayer.clear();
    if (sparks) {
      const core = CLASH_TUNING.sparkSize;
      for (const sp of sparks.particles) {
        const a = sp.life / sp.maxLife;
        const px = sp.x * s, py = sp.y * s;
        this.sparkLayer.circle(px, py, core * 1.8 * s).fill({ color: HOT, alpha: 0.35 * a });
        this.sparkLayer.circle(px, py, core * s).fill({ color: WHITE, alpha: a });
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

  /** Linear-interpolate between two hex colors by t (0..1). Used to resolve white -> team. */
  private lerpColor(a: number, b: number, t: number): number {
    const k = Math.min(1, Math.max(0, t));
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    const r = Math.round(ar + (br - ar) * k);
    const g = Math.round(ag + (bg - ag) * k);
    const bl = Math.round(ab + (bb - ab) * k);
    return (r << 16) | (g << 8) | bl;
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
