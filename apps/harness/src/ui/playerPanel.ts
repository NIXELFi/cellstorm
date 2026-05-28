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
  private idxF = 0; // current (fractional) frame index
  private lastDrawn = -1;
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
      this.audio.setLog(log);
      this.scrub.max = String(Math.max(1, frames.length - 1));
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
      if (this.playing && this.frames.length > 0) {
        const last = this.frames.length - 1;
        this.idxF = Math.min(this.idxF + this.speed, last);
        const i = Math.floor(this.idxF);
        if (i !== this.lastDrawn) this.drawAt(i, true);
        if (this.idxF >= last) {
          this.setPlaying(false);
          this.audio.stop();
        }
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** Draw frame `i`. When `withEvents`, replay the events of every frame since the last drawn one
   *  (so cosmetic FX + the shake/aberration impact fire); on a scrub/seek we draw without events. */
  private drawAt(i: number, withEvents: boolean): void {
    if (!this.player) return;
    const f = this.frames[i];
    if (!f) return;
    let evs: SimEvent[] = [];
    if (withEvents && i > this.lastDrawn) {
      for (let j = this.lastDrawn + 1; j <= i; j++) evs = evs.concat(this.eventsByFrame[j] ?? []);
    }
    this.player.renderSnapshot(f, withEvents ? evs : []);
    this.lastDrawn = i;
    this.idxF = i;
    this.updateLabel(i);
  }

  private updateLabel(i: number): void {
    const last = this.frames.length - 1;
    this.scrub.value = String(i);
    const sec = (i / 60).toFixed(1);
    this.frameLabel.textContent = i >= last && last > 0 ? `${sec}s / ${(last / 60).toFixed(1)}s (ended)` : `${sec}s`;
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
        if (this.idxF >= this.frames.length - 1) { this.idxF = 0; this.lastDrawn = -1; } // replay from start
        this.setPlaying(true);
        this.syncAudio();
      }
    };

    const stepBtn = document.createElement("button");
    stepBtn.className = "btn";
    stepBtn.textContent = "Step";
    stepBtn.onclick = () => {
      if (this.frames.length === 0) return;
      this.setPlaying(false);
      this.drawAt(Math.min(this.lastDrawn + 1, this.frames.length - 1), true);
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
    status.className = "muted";
    status.textContent = "Starting render…";
    this.renderCmd.appendChild(status);

    let renderId: string;
    try {
      ({ renderId } = await startRender(this.config, this.hud));
    } catch (err) {
      status.textContent = `Couldn't start render: ${err instanceof Error ? err.message : String(err)}`;
      return;
    }
    const poll = window.setInterval(() => {
      void fetchRenderProgress(renderId)
        .then((st) => {
          if (st.state === "rendering") status.textContent = `Rendering… ${st.frames} frames captured`;
          else if (st.state === "encoding") status.textContent = `Encoding ${st.frames} frames to MP4…`;
          else if (st.state === "done") {
            status.textContent = "Done — opening in Finder + player ✓";
            window.clearInterval(poll);
          } else if (st.state === "error") {
            status.textContent = `Render failed: ${st.error ?? "unknown error"}`;
            window.clearInterval(poll);
          }
        })
        .catch(() => {});
    }, 700);
  }

  private syncAudio(): void {
    const last = this.frames.length - 1;
    const ok = audioShouldPlay({ enabled: this.soundOn, playing: this.playing, speed: this.speed, ended: this.idxF >= last });
    if (ok) this.audio.start(Math.floor(this.idxF));
    else this.audio.stop();
  }

  private jumpToClimax(): void {
    if (!this.log || this.frames.length === 0) return;
    const tick = Math.min(climaxTick(this.log), this.frames.length - 1);
    this.setPlaying(false);
    this.audio.stop();
    this.lastDrawn = -1; // force a fresh draw without replaying intervening events
    this.drawAt(tick, false);
  }

  private teardownPlayer(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = undefined;
    this.audio.invalidate();
    this.player?.destroy();
    this.player = undefined;
  }
}
