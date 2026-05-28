// BattlePlayer: owns a sim World, a PixiScene, a Hud, and a cosmetic PRNG. The SAME class is
// used by the harness preview and the 4K renderer, so preview == final render (WYSIWYG). The
// caller constructs and owns the Pixi Application (visible canvas in the harness, headless in
// the renderer) and passes it in.
//
// DETERMINISM: gameplay advances ONLY through the sim's step() (via ./simCore). Cosmetic FX use
// a SEPARATE cosmetic PRNG seeded from config.seed XOR a salt — never world.prng — so visual
// tweaks can't change which seeds score well. stepFrame() is wall-clock-free; the harness calls
// it on rAF, the renderer once per output frame.

import { Application } from "pixi.js";
import { makePrng, EventSink, type BattleConfig } from "@cellstorm/sim";
import { PixiScene } from "./scene";
import { powerStyle } from "./glyphs";
import { Hud } from "./hud/compositor";
import { type HudConfig, DEFAULT_HUD } from "./hud/types";
import { THEME, type Theme } from "./theme";
import { ParticleField } from "./fx";
import { startSim, advance, seekState, countsOf, type SimState } from "./simCore";

/** Cosmetic PRNG salt: keeps the FX stream disjoint from the gameplay stream. */
export const COSMETIC_SALT = 0x9e3779b9;

export interface PlayerOptions {
  config: BattleConfig;
  hud: HudConfig;
  /** Target resolution multiplier: 1 for preview (280x498), ~7.7 for 4K (2160x3840). */
  resolutionScale: number;
  theme?: Theme;
}

export class BattlePlayer {
  private readonly app: Application;
  private readonly config: BattleConfig;
  private readonly scale: number;
  private readonly theme: Theme;
  private readonly scene: PixiScene;
  private readonly hud: Hud;
  private cosmetic: ParticleField;
  private state: SimState;
  private sink: EventSink;
  private drainedEvents = 0;
  private playing = false;
  private speed = 1;
  private speedAccumulator = 0;

  constructor(app: Application, opts: PlayerOptions) {
    this.app = app;
    this.config = opts.config;
    this.scale = opts.resolutionScale;
    this.theme = opts.theme ?? THEME;

    const { state, sink } = startSim(this.config);
    this.state = state;
    this.sink = sink;

    this.cosmetic = new ParticleField(this.cosmeticPrng());
    this.scene = new PixiScene(app, { arena: this.config.arena, scale: this.scale, theme: this.theme });
    this.hud = new Hud(app, opts.hud ?? DEFAULT_HUD, this.config.powers, {
      arena: this.config.arena,
      scale: this.scale,
      theme: this.theme,
    });

    this.render();
  }

  /** Advance the sim one tick, spawn cosmetic FX from new events, and render. Returns ended. */
  stepFrame(): boolean {
    if (!this.state.ended) {
      advance(this.state, this.sink);
      this.drainNewEvents();
    }
    this.cosmetic.advance();
    this.render();
    return this.state.ended;
  }

  /** Deterministic scrub: re-sim from 0 to `tick` and rebuild cosmetic state from its events. */
  seekTo(tick: number): void {
    this.state = seekState(this.config, tick);
    // Re-derive the event stream up to `tick` deterministically by re-simming with a sink.
    const fresh = startSim(this.config);
    while (fresh.state.world.frame < this.state.world.frame && !fresh.state.ended) {
      advance(fresh.state, fresh.sink);
    }
    this.sink = fresh.sink;
    this.drainedEvents = this.sink.events.length; // skip replaying historical FX bursts
    this.cosmetic = new ParticleField(this.cosmeticPrng());
    this.hud.reset();
    this.render();
  }

  /** rAF-friendly tick that honors playback speed (sub-1x stutters fewer steps). */
  advanceBySpeed(): boolean {
    if (!this.playing || this.state.ended) return this.state.ended;
    this.speedAccumulator += this.speed;
    let ended: boolean = this.state.ended;
    while (this.speedAccumulator >= 1) {
      this.speedAccumulator -= 1;
      ended = this.stepFrame();
      if (ended) break;
    }
    return ended;
  }

  play(): void {
    this.playing = true;
  }
  pause(): void {
    this.playing = false;
  }
  setSpeed(mult: number): void {
    this.speed = Math.max(0, mult);
  }

  get frame(): number {
    return this.state.world.frame;
  }
  get ended(): boolean {
    return this.state.ended;
  }
  get isPlaying(): boolean {
    return this.playing;
  }

  hudConfig(): HudConfig {
    return this.hud.getConfig();
  }
  setHudConfig(config: Partial<HudConfig>): void {
    this.hud.setConfig(config);
    this.render();
  }

  destroy(): void {
    this.scene.destroy();
    this.hud.destroy();
    this.cosmetic.clear();
  }

  // -- internals -------------------------------------------------------------

  private cosmeticPrng() {
    return makePrng((this.config.seed ^ COSMETIC_SALT) >>> 0);
  }

  private drainNewEvents(): void {
    const events = this.sink.events;
    for (let i = this.drainedEvents; i < events.length; i++) {
      const e = events[i]!;
      switch (e.type) {
        case "death": {
          // Death burst styled by the dying team's power: Glasshammer shatters into fast shards.
          const style = powerStyle(this.config.powers[e.team] ?? "");
          if (style.death === "shatter") this.cosmetic.spawn(e.x, e.y, e.team, 12, { speed: 7, life: 22 });
          else this.cosmetic.spawn(e.x, e.y, e.team, 5);
          break;
        }
        case "explosion":
          // Bomb: a big even radial shockwave ring.
          this.cosmetic.spawn(e.x, e.y, e.team, 22, { ring: true, speed: 6, life: 20 });
          break;
        default:
          break;
      }
    }
    this.drainedEvents = events.length;
  }

  private render(): void {
    this.scene.draw(this.state.world, this.cosmetic);
    this.hud.update(countsOf(this.state.world), this.state.world.frame, this.state.world.winner);
  }
}
