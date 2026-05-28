// Player panel: creates a Pixi Application + BattlePlayer and REPLAYS the authoritative Node
// simulation (drawable frames fetched from the bridge) — it does NOT re-simulate in the browser.
// The sim is not bit-identical across V8 builds (FMA contraction), so the browser must only draw;
// this guarantees the preview matches the headless render exactly. Playback/scrub/climax are all
// index-based over the fetched frame array.

import { Application } from "pixi.js";
import { BattlePlayer, type HudConfig, type Theme } from "@cellstorm/render";
import { DEFAULT_HUD } from "@cellstorm/render";
import type { BattleConfig, BattleLog, DrawFrame, SimEvent } from "@cellstorm/sim";
import { fetchFrames, startRender, fetchRenderProgress } from "../api";
import { renderView } from "../renderProgress";
import { buildOpeningSequence, DEFAULT_OPENING } from "@cellstorm/render/opening";
import { climaxTick } from "./logLogic";
import { PreviewAudio } from "./previewAudio";
import { audioShouldPlay } from "./previewAudioLogic";

const PREVIEW_SCALE = 1.5; // 280x498 logical -> 420x747 canvas (crisp but light)

export interface PlayerPanelHandle {
  player: BattlePlayer;
  config: BattleConfig;
}

export class PlayerPanel {
  readonly el: HTMLElement;
  private readonly mount: HTMLElement;
  private readonly controls: HTMLElement;
  private app?: Application;
  private player?: BattlePlayer;
  private config?: BattleConfig;
  private hud: HudConfig = { ...DEFAULT_HUD };
  private theme?: Theme;
  private rafId?: number;
  private scrub!: HTMLInputElement;
  private frameLabel!: HTMLElement;
  private playPauseBtn!: HTMLButtonElement;
  private hudOverlay?: HTMLElement;
  private renderCmd!: HTMLElement;
  private onPlayerReady?: (h: PlayerPanelHandle) => void;
  private readonly audio = new PreviewAudio();
  private soundOn = false;
  private speed = 1;

  // Replay state — the authoritative Node frames + per-tick events.
  private frames: DrawFrame[] = [];
  private eventsByFrame: SimEvent[][] = [];
  private log?: BattleLog;
  // Cold-open playback order: [montage clips…, 0, 1, …, N]. `idxF`/`lastDrawn` are POSITIONS in
  // `order` (not raw frame indices) so the preview plays the same montage → cut → battle as the render.
  private order: number[] = [];
  private cutAt = 0; // position in `order` where the real battle (t=0) begins
  private cutPoints: number[] = []; // positions that are hard cuts (reset cosmetic FX on crossing)
  private idxF = 0; // current (fractional) position in `order`
  private lastDrawn = -1; // last drawn position in `order`
  private playing = false;
  private loadToken = 0; // guards against a superseded async frame load

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "player-panel";
    const header = document.createElement("div");
    header.className = "panel-header";
    header.textContent = "Player";
    this.mount = document.createElement("div");
    this.mount.className = "player-mount";
    this.mount.innerHTML = `<div class="empty">Select a candidate to replay.</div>`;
    this.controls = document.createElement("div");
    this.controls.className = "player-controls";
    this.el.append(header, this.mount, this.controls);
  }

  onReady(cb: (h: PlayerPanelHandle) => void): void {
    this.onPlayerReady = cb;
  }
  getPlayer(): BattlePlayer | undefined {
    return this.player;
  }
  getConfig(): BattleConfig | undefined {
    return this.config;
  }
  getHud(): HudConfig {
    return { ...this.hud };
  }

  async load(config: BattleConfig, hud?: HudConfig, theme?: Theme): Promise<void> {
    this.config = config;
    if (hud) this.hud = hud;
    if (theme) this.theme = theme;
    await this.rebuild();
  }

  async rebuild(configOverride?: BattleConfig): Promise<void> {
    if (configOverride) this.config = configOverride;
    if (!this.config) return;
    this.teardownPlayer();

    const w = Math.round(this.config.arena.width * PREVIEW_SCALE);
    const h = Math.round(this.config.arena.height * PREVIEW_SCALE);
    if (!this.app) {
      const app = new Application();
      await app.init({ width: w, height: h, background: 0x050008, antialias: true });
      this.app = app;
      this.mount.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.className = "stage-wrap";
      wrap.style.cssText = `position:relative;width:${w}px;height:${h}px;`;
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:absolute;inset:0;";
      wrap.append(app.canvas as HTMLCanvasElement, overlay);
      this.mount.appendChild(wrap);
      this.hudOverlay = overlay;
    } else {
      this.app.renderer.resize(w, h);
      const wrap = this.hudOverlay?.parentElement;
      if (wrap) wrap.style.cssText = `position:relative;width:${w}px;height:${h}px;`;
    }

    this.frames = [];
    this.eventsByFrame = [];
    this.idxF = 0;
    this.lastDrawn = -1;
    this.playing = false;
    this.player = new BattlePlayer(this.app, {
      config: this.config, hud: this.hud, resolutionScale: PREVIEW_SCALE, theme: this.theme, hudRoot: this.hudOverlay,
    });
    this.renderControls();
    this.startLoop();
    this.onPlayerReady?.({ player: this.player, config: this.config });
    void this.loadFrames();
  }

  /** Fetch the authoritative Node frames for the current config and draw the first one. */
  private async loadFrames(): Promise<void> {
    if (!this.config) return;
    const token = ++this.loadToken;
    this.frameLabel.textContent = "loading…";
    try {
      const { frames, log } = await fetchFrames(this.config);
      if (token !== this.loadToken) return; // a newer load superseded this one
      this.frames = frames;
      this.log = log;
      this.eventsByFrame = frames.map(() => []);
      for (const e of log.events) {
        if (e.tick >= 0 && e.tick < this.eventsByFrame.length) this.eventsByFrame[e.tick]!.push(e);
      }
      // Same cold-open sequence the renderer uses (WYSIWYG): flash-forward teaser, then cut to t=0.
      const seq = buildOpeningSequence(log, frames.length, DEFAULT_OPENING);
      this.order = seq.order;
      this.cutAt = seq.cutAt;
      this.cutPoints = seq.cutPoints;
      this.audio.setLog(log);
      this.scrub.max = String(Math.max(1, this.order.length - 1));
      this.lastDrawn = -1;
      this.idxF = 0;
      this.drawAt(0, false);
    } catch (err) {
      if (token === this.loadToken) this.frameLabel.textContent = `load failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private startLoop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    const tick = () => {
      if (this.playing && this.order.length > 0) {
        const last = this.order.length - 1;
        const prevPos = Math.floor(this.idxF);
        this.idxF = Math.min(this.idxF + this.speed, last);
        const pos = Math.floor(this.idxF);
        if (pos !== this.lastDrawn) this.drawAt(pos, true);
        // The teaser is silent; start the soundtrack right as playback crosses the cut to t=0.
        if (this.soundOn && prevPos < this.cutAt && pos >= this.cutAt) this.syncAudio();
        if (this.idxF >= last) {
          this.setPlaying(false);
          this.audio.stop();
        }
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** Draw output position `pos` (an index into `order`). During the teaser the HUD is hidden; at the
   *  cut to t=0 cosmetic FX are reset. When `withEvents`, replay the events of every position since
   *  the last drawn one (so cosmetic FX + the shake/aberration impact fire); a scrub draws without. */
  private drawAt(pos: number, withEvents: boolean): void {
    if (!this.player) return;
    const frameIndex = this.order[pos];
    if (frameIndex === undefined) return;
    const f = this.frames[frameIndex];
    if (!f) return;
    const hudHidden = pos < this.cutAt; // title-free flash-forward montage
    // Reset cosmetic FX whenever playback crosses a hard cut (montage clip boundary or the cut to t=0)
    // so particles/shake don't bleed across the scene change.
    const resetCosmetic = this.cutPoints.some((c) => c > this.lastDrawn && c <= pos);
    let evs: SimEvent[] = [];
    if (withEvents && pos > this.lastDrawn) {
      for (let p = this.lastDrawn + 1; p <= pos; p++) {
        const fi = this.order[p];
        if (fi !== undefined) evs = evs.concat(this.eventsByFrame[fi] ?? []);
      }
    }
    this.player.renderSnapshot(f, withEvents ? evs : [], { hudHidden, resetCosmetic });
    this.lastDrawn = pos;
    this.idxF = pos;
    this.updateLabel(pos);
  }

  private updateLabel(pos: number): void {
    const last = this.order.length - 1;
    this.scrub.value = String(pos);
    const sec = (pos / 60).toFixed(1);
    this.frameLabel.textContent = pos >= last && last > 0 ? `${sec}s / ${(last / 60).toFixed(1)}s (ended)` : `${sec}s`;
  }

  private setPlaying(p: boolean): void {
    this.playing = p;
    this.playPauseBtn.textContent = p ? "Pause" : "Play";
  }

  private renderControls(): void {
    this.controls.innerHTML = "";
    const playPause = document.createElement("button");
    this.playPauseBtn = playPause;
    playPause.className = "btn";
    playPause.textContent = "Play";
    playPause.onclick = () => {
      if (this.frames.length === 0) return;
      if (this.playing) {
        this.setPlaying(false);
        this.audio.stop();
      } else {
        if (this.idxF >= this.order.length - 1) { this.idxF = 0; this.lastDrawn = -1; } // replay from start (incl. teaser)
        this.setPlaying(true);
        this.syncAudio();
      }
    };

    const stepBtn = document.createElement("button");
    stepBtn.className = "btn";
    stepBtn.textContent = "Step";
    stepBtn.onclick = () => {
      if (this.order.length === 0) return;
      this.setPlaying(false);
      this.drawAt(Math.min(this.lastDrawn + 1, this.order.length - 1), true);
    };

    const climax = document.createElement("button");
    climax.className = "btn";
    climax.textContent = "Jump to climax";
    climax.onclick = () => this.jumpToClimax();

    const sendRender = document.createElement("button");
    sendRender.className = "btn";
    sendRender.textContent = "Render video";
    sendRender.title = "Render this battle to an MP4 (opens in Finder + player when done)";
    sendRender.onclick = () => void this.sendToRender();

    const soundBtn = document.createElement("button");
    soundBtn.className = "btn";
    const soundLabel = () => (soundBtn.textContent = this.soundOn ? "🔊 Sound: on" : "🔇 Sound: off");
    soundBtn.title = "Play the generated soundtrack during 1x playback (what the rendered MP4 will carry)";
    soundLabel();
    soundBtn.onclick = () => {
      this.soundOn = !this.soundOn;
      soundLabel();
      if (this.soundOn) this.syncAudio();
      else this.audio.stop();
    };

    const speedSel = document.createElement("select");
    for (const s of [0.25, 0.5, 1, 2, 4]) {
      const opt = document.createElement("option");
      opt.value = String(s);
      opt.textContent = `${s}x`;
      if (s === 1) opt.selected = true;
      speedSel.appendChild(opt);
    }
    speedSel.onchange = () => {
      this.speed = Number(speedSel.value);
      if (this.soundOn && this.playing) this.syncAudio();
    };

    this.scrub = document.createElement("input");
    this.scrub.type = "range";
    this.scrub.min = "0";
    this.scrub.max = String(Math.max(1, this.frames.length - 1));
    this.scrub.value = "0";
    this.scrub.className = "scrub";
    this.scrub.oninput = () => {
      this.setPlaying(false);
      this.audio.stop();
      this.drawAt(Number(this.scrub.value), false);
    };

    this.frameLabel = document.createElement("span");
    this.frameLabel.className = "muted frame-label";
    this.frameLabel.textContent = "0s";

    const row1 = document.createElement("div");
    row1.className = "inline";
    row1.append(playPause, stepBtn, climax, sendRender, soundBtn, speedSel, this.frameLabel);
    const row2 = document.createElement("div");
    row2.className = "inline scrub-row";
    row2.appendChild(this.scrub);

    this.renderCmd = document.createElement("div");
    this.renderCmd.className = "render-cmd";
    this.renderCmd.hidden = true;

    this.controls.append(row1, row2, this.renderCmd);
  }

  /** Render this candidate to an MP4 via the bridge using the EXACT current config (Node-simulated,
   *  matching this preview), showing live progress; the bridge reveals + opens it when done. */
  private async sendToRender(): Promise<void> {
    if (!this.config) return;
    this.renderCmd.hidden = false;
    this.renderCmd.innerHTML = "";
    const status = document.createElement("div");
    status.className = "muted render-status";
    status.textContent = "Starting render…";
    const bar = document.createElement("div");
    bar.className = "render-bar indeterminate";
    const fill = document.createElement("div");
    fill.className = "render-bar-fill";
    bar.appendChild(fill);
    this.renderCmd.append(status, bar);

    let renderId: string;
    try {
      ({ renderId } = await startRender(this.config, this.hud));
    } catch (err) {
      status.textContent = `Couldn't start render: ${err instanceof Error ? err.message : String(err)}`;
      bar.classList.add("error");
      return;
    }
    const poll = window.setInterval(() => {
      void fetchRenderProgress(renderId)
        .then((st) => {
          const v = renderView(st, Date.now());
          status.textContent = v.label;
          fill.style.width = `${Math.round(v.fraction * 100)}%`;
          bar.classList.toggle("indeterminate", v.indeterminate);
          bar.classList.toggle("done", st.state === "done");
          bar.classList.toggle("error", st.state === "error");
          if (v.terminal) window.clearInterval(poll);
        })
        .catch(() => {});
    }, 400);
  }

  private syncAudio(): void {
    const last = this.order.length - 1;
    const pos = Math.floor(this.idxF);
    // The soundtrack is the battle (real ticks 0..N); the teaser plays silent. Map the output
    // position back to the real battle tick and only play once we're past the cut.
    const realTick = Math.max(0, pos - this.cutAt);
    const ok =
      pos >= this.cutAt &&
      audioShouldPlay({ enabled: this.soundOn, playing: this.playing, speed: this.speed, ended: this.idxF >= last });
    if (ok) this.audio.start(realTick);
    else this.audio.stop();
  }

  private jumpToClimax(): void {
    if (!this.log || this.order.length === 0) return;
    // climaxTick is a real battle tick; map it into the output timeline (past the teaser cut).
    const pos = Math.min(this.cutAt + climaxTick(this.log), this.order.length - 1);
    this.setPlaying(false);
    this.audio.stop();
    this.lastDrawn = -1; // force a fresh draw without replaying intervening events
    this.drawAt(pos, false);
  }

  private teardownPlayer(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = undefined;
    this.audio.invalidate();
    this.player?.destroy();
    this.player = undefined;
  }
}
