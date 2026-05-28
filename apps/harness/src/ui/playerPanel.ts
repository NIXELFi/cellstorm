// Player panel: creates a Pixi Application and a BattlePlayer for the selected config on a 9:16
// canvas, with play/pause, step, scrub (slider -> seekTo), speed, and "jump to climax" (fetch the
// log, find the densest death cluster in the final portion, seekTo it). The BattlePlayer is the
// SAME class the 4K renderer uses, so this preview is WYSIWYG.

import { Application } from "pixi.js";
import { BattlePlayer, type HudConfig, type Theme } from "@cellstorm/render";
import { DEFAULT_HUD } from "@cellstorm/render";
import type { BattleConfig } from "@cellstorm/sim";
import { configIdOf } from "@cellstorm/cli/config-id";
import { fetchLog, startRender, fetchRenderProgress } from "../api";
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
  private hudOverlay?: HTMLElement; // DOM layer over the canvas for the CSS broadcast HUD
  private endFrame = -1; // total playback length (frames) once the battle has ended
  private renderCmd!: HTMLElement;
  private onPlayerReady?: (h: PlayerPanelHandle) => void;
  private readonly audio = new PreviewAudio();
  private soundOn = false;
  private speed = 1;

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

  /** Register a callback fired whenever a new BattlePlayer is created (HUD/tuning panels bind to it). */
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

  /** Load a config, recreating the Pixi app + player. `hud`/`theme` override the defaults. */
  async load(config: BattleConfig, hud?: HudConfig, theme?: Theme): Promise<void> {
    this.config = config;
    if (hud) this.hud = hud;
    if (theme) this.theme = theme;
    await this.rebuild();
  }

  /** Re-instantiate the player with the current config/hud/theme (used by the tuning panel). */
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
      // Wrap canvas + an absolutely-positioned overlay so the CSS HUD composites on top.
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

    this.endFrame = -1; // reset playback-length tracking for the new battle
    this.player = new BattlePlayer(this.app, {
      config: this.config,
      hud: this.hud,
      resolutionScale: PREVIEW_SCALE,
      theme: this.theme,
      hudRoot: this.hudOverlay,
    });
    this.renderControls();
    this.startLoop();
    this.onPlayerReady?.({ player: this.player, config: this.config });
  }

  private startLoop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    const tick = () => {
      if (this.player) {
        this.player.advanceBySpeed();
        this.syncScrub();
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private syncScrub(): void {
    if (!this.player || !this.config) return;
    if (this.player.ended && this.endFrame < 0) {
      this.endFrame = this.player.frame;
      this.audio.stop(); // soundtrack ends with the battle
    }
    const total = this.endFrame > 0 ? this.endFrame : this.config.maxTicks;
    this.scrub.max = String(total);
    this.scrub.value = String(this.player.frame);
    const sec = (this.player.frame / 60).toFixed(1);
    this.frameLabel.textContent =
      this.endFrame > 0 ? `${sec}s / ${(this.endFrame / 60).toFixed(1)}s (ended)` : `${sec}s`;
  }

  private renderControls(): void {
    this.controls.innerHTML = "";
    const playPause = document.createElement("button");
    playPause.className = "btn";
    playPause.textContent = "Play";
    playPause.onclick = () => {
      if (!this.player) return;
      if (this.player.isPlaying) {
        this.player.pause();
        playPause.textContent = "Play";
        this.audio.stop();
      } else {
        this.player.play();
        playPause.textContent = "Pause";
        this.syncAudio();
      }
    };

    const stepBtn = document.createElement("button");
    stepBtn.className = "btn";
    stepBtn.textContent = "Step";
    stepBtn.onclick = () => {
      this.player?.stepFrame();
      this.syncScrub();
    };

    const climax = document.createElement("button");
    climax.className = "btn";
    climax.textContent = "Jump to climax";
    climax.onclick = () => void this.jumpToClimax();

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
      this.player?.setSpeed(this.speed);
      // Soundtrack only stays in sync at 1x; restart or stop accordingly.
      if (this.soundOn && this.player?.isPlaying) this.syncAudio();
    };

    this.scrub = document.createElement("input");
    this.scrub.type = "range";
    this.scrub.min = "0";
    this.scrub.max = String(this.config?.maxTicks ?? 1000);
    this.scrub.value = "0";
    this.scrub.className = "scrub";
    this.scrub.oninput = () => {
      this.player?.pause();
      playPause.textContent = "Play";
      this.audio.stop(); // scrubbing breaks sync; sound resumes on the next Play
      this.player?.seekTo(Number(this.scrub.value));
      this.frameLabel.textContent = `${this.scrub.value}t`;
    };

    this.frameLabel = document.createElement("span");
    this.frameLabel.className = "muted frame-label";
    this.frameLabel.textContent = "0t";

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

  /** Render this candidate (config + current HUD) to an MP4 via the bridge, showing live progress.
   * When it finishes, the bridge reveals the file in Finder and opens it for playback. */
  private async sendToRender(): Promise<void> {
    if (!this.config) return;
    const configId = configIdOf(this.config);
    this.renderCmd.hidden = false;
    this.renderCmd.innerHTML = "";
    const status = document.createElement("div");
    status.className = "muted";
    status.textContent = "Starting render…";
    this.renderCmd.appendChild(status);

    let renderId: string;
    try {
      ({ renderId } = await startRender(configId, this.hud));
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

  /** Start the soundtrack from the current frame when conditions allow; otherwise ensure silence. */
  private syncAudio(): void {
    if (!this.player || !this.config) return;
    const ok = audioShouldPlay({
      enabled: this.soundOn,
      playing: this.player.isPlaying,
      speed: this.speed,
      ended: this.player.ended,
    });
    if (ok) this.audio.start(this.config, this.player.frame);
    else this.audio.stop();
  }

  private async jumpToClimax(): Promise<void> {
    if (!this.player || !this.config) return;
    try {
      const id = configIdOf(this.config);
      const log = await fetchLog(id);
      const tick = climaxTick(log);
      this.player.pause();
      this.player.seekTo(tick);
      this.syncScrub();
    } catch {
      /* no log available; ignore */
    }
  }

  private teardownPlayer(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = undefined;
    this.audio.invalidate(); // config is about to change; drop the cached soundtrack
    this.player?.destroy();
    this.player = undefined;
  }
}
