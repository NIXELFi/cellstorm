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
import { makePrng, EventSink, powerByName, BASE_RADIUS, type BattleConfig, type DrawFrame, type SimEvent } from "@cellstorm/sim";
import type { World } from "@cellstorm/sim";
import { PixiScene } from "./scene";
import { powerStyle } from "./glyphs";
import { CssHud } from "./cssHud";
import { type HudConfig, DEFAULT_HUD } from "./hud/types";
import { THEME, type Theme } from "./theme";
import { ParticleField, FlashField, BURST_TUNING } from "./fx";
import { CLASH_TUNING, findClashes } from "./clash";
import { startSim, advance, seekState, countsOf, type SimState } from "./simCore";
import { PostFx } from "./postfx";
import { impactFromEvents, decayImpact, winnerFlash } from "./postfxLogic";

const IMPACT_DECAY = 0.86; // per-tick decay of the screen-shake / aberration impact envelope
const FLASH_SEC = 0.5; // winner-reveal flash duration

/** Cosmetic PRNG salt: keeps the FX stream disjoint from the gameplay stream. */
export const COSMETIC_SALT = 0x9e3779b9;

export interface PlayerOptions {
  config: BattleConfig;
  hud: HudConfig;
  /** Target resolution multiplier: 1 for preview (280x498), ~7.7 for 4K (2160x3840). */
  resolutionScale: number;
  theme?: Theme;
  /** DOM element overlaying the canvas; the CSS broadcast HUD renders here. */
  hudRoot?: HTMLElement;
}

export class BattlePlayer {
  private readonly app: Application;
  private readonly config: BattleConfig;
  private readonly scale: number;
  private readonly theme: Theme;
  private readonly scene: PixiScene;
  private readonly hud?: CssHud;
  private cosmetic: ParticleField;
  private flashes: FlashField; // kill-flash rings + center pops (death/explosion)
  private sparks: ParticleField; // bright impact sparks at clash fronts (second cosmetic field)
  private clashGate: ReturnType<typeof makePrng>; // cosmetic PRNG gating per-clash spark spawns
  private readonly postfx: PostFx;
  private impact = 0; // 0..1 screen-shake / aberration envelope, decays each tick
  private hudHidden = false; // suppress the HUD (used for the title-free flash-forward teaser)
  private lastHudHidden = false; // detect the un-hide edge at the teaser cut (to prime counters)
  private teamRadii: number[] = []; // per-team cell radius, for reconstructing draw-worlds on replay
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
    this.flashes = new FlashField();
    // Second cosmetic field for impact sparks. Reuses the cosmetic PRNG stream (a fresh seeded
    // instance) — never the gameplay RNG — so scoring stays untouched.
    this.sparks = new ParticleField(this.cosmeticPrng());
    this.clashGate = this.cosmeticPrng();
    this.scene = new PixiScene(app, { arena: this.config.arena, scale: this.scale, theme: this.theme });
    // Post-FX wraps the scene (bloom/vignette/grade + impact-reactive aberration & shake). Cosmetic
    // only; reads nothing from gameplay RNG.
    this.postfx = new PostFx(app, this.scene.root, { scale: this.scale });
    if (opts.hudRoot) {
      this.hud = new CssHud(opts.hudRoot, opts.hud ?? DEFAULT_HUD, this.config.powers, this.theme);
    }

    this.render();
  }

  /** Advance the sim one tick, spawn cosmetic FX from new events, and render. Returns ended. */
  stepFrame(): boolean {
    if (!this.state.ended) {
      advance(this.state, this.sink);
      const newEvents = this.sink.events.slice(this.drainedEvents);
      this.drainNewEvents();
      this.impact = decayImpact(this.impact, impactFromEvents(newEvents), IMPACT_DECAY);
    } else {
      this.impact = decayImpact(this.impact, 0, IMPACT_DECAY);
    }
    this.emitClashSparks();
    this.cosmetic.advance();
    this.flashes.advance();
    this.sparks.advance();
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
    this.flashes = new FlashField();
    this.sparks = new ParticleField(this.cosmeticPrng());
    this.clashGate = this.cosmeticPrng();
    this.impact = 0; // shake/aberration history isn't reconstructed on a scrub
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
    return this.hud?.getConfig() ?? DEFAULT_HUD;
  }
  setHudConfig(config: Partial<HudConfig>): void {
    this.hud?.setConfig(config);
    this.render();
  }

  destroy(): void {
    this.postfx.destroy();
    this.scene.destroy();
    this.hud?.destroy();
    this.cosmetic.clear();
    this.flashes.clear();
    this.sparks.clear();
  }

  // -- internals -------------------------------------------------------------

  private cosmeticPrng() {
    return makePrng((this.config.seed ^ COSMETIC_SALT) >>> 0);
  }

  /**
   * Detect clash fronts cosmetically from the current draw positions and spawn brief bright impact
   * sparks there. Detection reads ONLY positions (deterministic draw data); the only randomness is
   * the per-point spawn gate + the spark jitter, both from the cosmetic PRNG stream — so gameplay
   * and scoring are unaffected. Spawns are bounded by CLASH_TUNING.maxPerFrame (the cap inside
   * findClashes) so this never spams the particle pool.
   */
  private emitClashSparks(): void {
    if (!CLASH_TUNING.enabled) return;
    const clashes = findClashes(this.state.world.cells, CLASH_TUNING);
    for (const p of clashes) {
      if (this.clashGate() >= CLASH_TUNING.spawnProbability) continue;
      // team -1 → drawn as a white-hot impact spark (no team tint) by the scene.
      this.sparks.spawn(p.x, p.y, -1, CLASH_TUNING.sparkCount, {
        speed: CLASH_TUNING.sparkSpeed,
        life: CLASH_TUNING.sparkLife,
      });
    }
  }

  private drainNewEvents(): void {
    const events = this.sink.events;
    for (let i = this.drainedEvents; i < events.length; i++) this.applyEventFx(events[i]!);
    this.drainedEvents = events.length;
  }

  /** Spawn cosmetic particles for one event. Shared by live stepping and snapshot replay. */
  private applyEventFx(e: SimEvent): void {
    switch (e.type) {
      case "death": {
        // Kill-flash POP + a punchier burst styled by the dying team's power.
        // Glasshammer shatters into more/faster shards; everyone else gets a fuller burst.
        const style = powerStyle(this.config.powers[e.team] ?? "");
        this.flashes.spawn(e.x, e.y, e.team);
        if (style.death === "shatter") {
          this.cosmetic.spawn(e.x, e.y, e.team, BURST_TUNING.glasshammerCount, {
            speed: BURST_TUNING.glasshammerSpeed,
            life: BURST_TUNING.glasshammerLife,
          });
        } else {
          this.cosmetic.spawn(e.x, e.y, e.team, BURST_TUNING.deathCount, {
            speed: BURST_TUNING.speed,
            life: BURST_TUNING.life,
          });
        }
        break;
      }
      case "explosion":
        // Bigger flash + bigger ring burst for the heavier explosion event.
        this.flashes.spawn(e.x, e.y, e.team, { big: true });
        this.cosmetic.spawn(e.x, e.y, e.team, BURST_TUNING.explosionCount, {
          ring: true,
          speed: BURST_TUNING.explosionSpeed,
          life: BURST_TUNING.explosionLife,
        });
        break;
      default:
        break;
    }
  }

  /**
   * Draw one Node-computed frame (single source of truth) instead of stepping our own sim. The
   * renderer and harness both feed DrawFrames produced once in Node, so what's drawn is identical on
   * every engine. `newEvents` are this tick's events (for cosmetic FX + the impact envelope).
   */
  renderSnapshot(
    frame: DrawFrame,
    newEvents: SimEvent[],
    opts?: { hudHidden?: boolean; resetCosmetic?: boolean },
  ): void {
    if (opts?.resetCosmetic) this.resetCosmeticState();
    this.state = { world: this.reconstructWorld(frame), ended: frame.resolvedFrame >= 0 };
    const hudHidden = opts?.hudHidden ?? false;
    // When the HUD un-hides at the teaser cut, seed the counters to the true counts so they don't
    // visibly ease up from zero on the first real frame (counts are part of the team-rooting hook).
    if (this.lastHudHidden && !hudHidden) this.hud?.primeCounts(countsOf(this.state.world));
    this.lastHudHidden = hudHidden;
    this.hudHidden = hudHidden;
    for (const e of newEvents) this.applyEventFx(e);
    this.impact = decayImpact(this.impact, impactFromEvents(newEvents), IMPACT_DECAY);
    this.emitClashSparks();
    this.cosmetic.advance();
    this.flashes.advance();
    this.sparks.advance();
    this.render();
  }

  /** Reset cosmetic-only state (particles + screen-shake/aberration envelope). Called at the flash-
   *  forward cut so teaser FX don't bleed into the real first frame. Touches NO gameplay/scoring. */
  resetCosmeticState(): void {
    this.cosmetic = new ParticleField(this.cosmeticPrng());
    this.flashes = new FlashField();
    this.sparks = new ParticleField(this.cosmeticPrng());
    this.clashGate = this.cosmeticPrng();
    this.impact = 0;
  }

  /** Rebuild a draw-only World from a DrawFrame so scene/HUD code runs unchanged. */
  private reconstructWorld(frame: DrawFrame): World {
    if (this.teamRadii.length === 0) {
      this.teamRadii = this.config.powers.map((p) => BASE_RADIUS * (powerByName(p).radius ?? 1));
    }
    const cells = frame.cells.map((c) => ({
      alive: true, team: c.team, x: c.x, y: c.y, hp: c.hpFrac, maxHp: 1,
      radius: c.radius || this.teamRadii[c.team] || BASE_RADIUS,
      vx: c.vx, vy: c.vy, dash: c.dash, stunT: c.stunT, plagueT: c.plagueT,
    }));
    return {
      cfg: this.config, cells, projectiles: frame.projectiles,
      frame: frame.frame, winner: frame.winner, resolvedFrame: frame.resolvedFrame,
    } as unknown as World;
  }

  private render(): void {
    this.scene.draw(this.state.world, this.cosmetic, this.flashes, this.sparks);
    if (this.hud) {
      this.hud.setHidden(this.hudHidden);
      // Skip the HUD update while hidden so its eased counters don't drift to the teaser's counts.
      if (!this.hudHidden) {
        this.hud.update(countsOf(this.state.world), this.state.world.frame, this.state.world.winner);
      }
    }
    const w = this.state.world;
    const flash = winnerFlash(w.frame, w.resolvedFrame, 60, FLASH_SEC);
    this.postfx.update(w.frame, this.impact, flash);
  }
}
