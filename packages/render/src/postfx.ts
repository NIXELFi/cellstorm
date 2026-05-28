// Post-processing FX stack. Wraps the scene in two containers — an outer one that carries the
// filter chain (bloom -> chromatic aberration -> color grade -> vignette) and an inner "shake" one
// that translates on impact — then hangs it on the stage. NOT unit-tested (needs WebGL); the
// reactive math lives in ./postfxLogic (tested). All animation is driven from the sim tick by the
// player, so the FX render identically in the harness and the headless renderer.
//
// Tasteful + minimal but clearly visible: a gentle neon bloom, a soft vignette and color grade, a
// touch of chromatic aberration that swells on explosions/deaths, a small screen shake on impact,
// and a brief brightness/bloom pop on the winner reveal.

import { Application, Container } from "pixi.js";
import { AdvancedBloomFilter, RGBSplitFilter, AdjustmentFilter, CRTFilter } from "pixi-filters";
import { aberrationPixels, shakeOffset } from "./postfxLogic";

export interface PostFxOptions {
  /** Arena-units -> canvas-pixels factor, so shake reads consistently at preview and 4K. */
  scale: number;
  enabled?: boolean;
}

const ABERRATION_BASE = 0.3; // px at rest (barely there)
const ABERRATION_MAX = 1.4; // px at full impact
const SHAKE_LOGICAL = 0.8; // logical px of shake at full impact (multiplied by scale) — gentle nudge
const OVERSCAN = 0.01; // 1% zoom so the small shake never exposes the background edge
const BLOOM_SCALE = 0.2; // bloom intensity at rest — a faint glow only

export class PostFx {
  private readonly outer = new Container();
  private readonly shake = new Container();
  private readonly bloom: AdvancedBloomFilter;
  private readonly rgb: RGBSplitFilter;
  private readonly grade: AdjustmentFilter;
  private readonly vignette: CRTFilter;
  private readonly scale: number;
  private readonly enabled: boolean;
  private readonly baseX: number;
  private readonly baseY: number;

  constructor(app: Application, target: Container, opts: PostFxOptions) {
    this.scale = opts.scale;
    this.enabled = opts.enabled ?? true;

    // Re-parent: stage -> outer (filters) -> shake (translate) -> target (scene.root).
    target.parent?.removeChild(target);
    this.shake.addChild(target);
    this.shake.scale.set(1 + OVERSCAN);
    this.outer.addChild(this.shake);
    app.stage.addChild(this.outer);

    // Center the overscan so the zoom doesn't push the picture off the top-left.
    this.baseX = -app.screen.width * OVERSCAN * 0.5;
    this.baseY = -app.screen.height * OVERSCAN * 0.5;
    this.shake.position.set(this.baseX, this.baseY);

    // High threshold = only the brightest cores bloom; tiny blur = a faint glow, never a haze.
    this.bloom = new AdvancedBloomFilter({ threshold: 0.7, bloomScale: BLOOM_SCALE, brightness: 1, blur: 1.5, quality: 4 });
    this.rgb = new RGBSplitFilter({ red: { x: ABERRATION_BASE, y: 0 }, green: { x: 0, y: 0 }, blue: { x: -ABERRATION_BASE, y: 0 } });
    this.grade = new AdjustmentFilter({ saturation: 1.06, contrast: 1.04, brightness: 1, gamma: 1 });
    // CRT filter used purely for a barely-there vignette (scanlines / noise / curvature all off).
    this.vignette = new CRTFilter({ vignetting: 0.06, vignettingAlpha: 1, vignettingBlur: 0.3, lineWidth: 0, lineContrast: 0, noise: 0, curvature: 0 });

    if (this.enabled) this.outer.filters = [this.bloom, this.rgb, this.grade, this.vignette];
  }

  /** Drive the tick-reactive uniforms. `impact` and `flash` are 0..1. */
  update(frame: number, impact: number, flash: number): void {
    if (!this.enabled) return;
    const ab = aberrationPixels(impact, ABERRATION_BASE, ABERRATION_MAX);
    this.rgb.red = { x: ab, y: 0 };
    this.rgb.blue = { x: -ab, y: 0 };

    const { dx, dy } = shakeOffset(frame, SHAKE_LOGICAL * this.scale * impact);
    this.shake.position.set(this.baseX + dx, this.baseY + dy);

    this.grade.brightness = 1 + flash * 0.25; // subtle pop on the winner reveal
    this.bloom.bloomScale = BLOOM_SCALE + flash * 0.15;
  }

  destroy(): void {
    this.outer.filters = [];
    this.outer.destroy({ children: false });
  }
}
