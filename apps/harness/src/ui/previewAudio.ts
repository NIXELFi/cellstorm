// Web Audio glue for the harness preview soundtrack. Builds the SAME AudioScore the renderer uses,
// from the AUTHORITATIVE Node battle log (fetched from the bridge — NOT re-simulated in the browser,
// which could diverge), synthesizes it once into an AudioBuffer, and plays it in lockstep with 1x
// playback. So what you hear here is exactly what the rendered MP4 carries (same battle, same audio).
//
// It also plays an optional user MUSIC track UNDER the synth: a decoded AudioBuffer through a gain
// node (relative volume), scheduled via musicCue (start offset + start-in-track) with a fade-in. Same
// settings drive the renderer's ffmpeg mux, so preview == final.

import { buildAudioScore, renderScore, DEFAULT_MUSIC, type MusicSettings } from "@cellstorm/audio";
import type { BattleLog } from "@cellstorm/sim";
import { audioOffsetSec, musicCue } from "./previewAudioLogic";

const FPS = 60;

export class PreviewAudio {
  private ctx?: AudioContext;
  private unlocked = false; // whether the WebKit/Safari silent-buffer unlock has run
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private log?: BattleLog;
  private musicBuffer?: AudioBuffer;
  private musicSource?: AudioBufferSourceNode;
  private musicGain?: GainNode;
  private music: MusicSettings = { ...DEFAULT_MUSIC };

  /** Set the authoritative battle log to score. Invalidates the cached buffer if it changed. */
  setLog(log: BattleLog): void {
    if (this.log === log) return;
    this.log = log;
    this.buffer = undefined;
    this.stop();
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      // webkitAudioContext fallback for older Safari (modern Safari has AudioContext).
      const AC: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    }
    return this.ctx;
  }

  /**
   * Unlock audio from a USER GESTURE. Call from click handlers (Sound toggle, Play).
   *
   * Two browser policies are at play:
   *  - Chrome leaves a context created/resumed OUTSIDE a gesture suspended → resume() in the click
   *    fixes it.
   *  - Safari/WebKit needs more: resume() alone does NOT start the audio hardware. You must actually
   *    PLAY a source within the gesture. So we also play a 1-sample silent buffer once (harmless on
   *    Chrome). Without this, Safari reports the context "running" (the tab shows a speaker icon) yet
   *    emits no sound — which silences BOTH the synth and the music.
   */
  unlock(): void {
    const ctx = this.ensureCtx();
    void ctx.resume();
    if (this.unlocked) return;
    try {
      const blip = ctx.createBufferSource();
      blip.buffer = ctx.createBuffer(1, 1, 22050);
      blip.connect(ctx.destination);
      blip.start(0);
      this.unlocked = true;
    } catch {
      /* best-effort unlock */
    }
  }

  private ensureBuffer(): AudioBuffer | undefined {
    if (!this.log) return undefined;
    const ctx = this.ensureCtx();
    if (this.buffer) return this.buffer;
    const score = buildAudioScore(this.log, FPS);
    const sr = ctx.sampleRate;
    const { left, right } = renderScore(score, sr);
    const buf = ctx.createBuffer(2, left.length, sr);
    buf.getChannelData(0).set(left);
    buf.getChannelData(1).set(right);
    this.buffer = buf;
    return buf;
  }

  /** Decode a user music file (raw bytes) for preview. Returns its duration in seconds. */
  async loadMusic(data: ArrayBuffer): Promise<number> {
    const buf = await this.ensureCtx().decodeAudioData(data.slice(0));
    this.musicBuffer = buf;
    return buf.duration;
  }

  clearMusic(): void {
    this.stopMusic();
    this.musicBuffer = undefined;
  }

  hasMusic(): boolean {
    return !!this.musicBuffer;
  }

  /** Update music settings live; if a track is currently sounding, reflect the new volume at once. */
  setMusic(s: MusicSettings): void {
    this.music = s;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setValueAtTime(s.enabled ? s.volume : 0, this.ctx.currentTime);
    }
  }

  /**
   * (Re)start playback. `synthFrame` is the battle tick for the synth (pass < 0 to skip the synth,
   * e.g. during the silent cold-open); `videoFrame` is the absolute video frame for the music, so the
   * music can sound over the intro from frame one.
   */
  start(synthFrame: number, videoFrame: number): void {
    this.ensureCtx();
    void this.ctx?.resume(); // browsers start the context suspended until a user gesture
    this.stop();
    if (synthFrame >= 0) this.playSynthSource(synthFrame);
    this.startMusic(videoFrame);
  }

  /**
   * Start ONLY the synth at `tick`, leaving any playing music untouched — used when playback crosses
   * the cold-open cut so the battle soundtrack begins WITHOUT restarting the music (which has been
   * playing over the intro since frame one).
   */
  startSynthOnly(tick: number): void {
    this.playSynthSource(tick);
  }

  private playSynthSource(tick: number): void {
    const buf = this.ensureBuffer();
    if (!buf || !this.ctx) return;
    if (this.source) {
      try { this.source.stop(); } catch { /* already stopped */ }
      this.source.disconnect();
      this.source = undefined;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    src.start(0, Math.min(audioOffsetSec(tick, FPS), buf.duration));
    this.source = src;
  }

  private startMusic(frame: number): void {
    if (!this.ctx || !this.musicBuffer || !this.music.enabled) return;
    const cue = musicCue(frame, FPS, this.music);
    if (!cue || cue.trackOffsetSec >= this.musicBuffer.duration) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.musicBuffer;
    const gain = this.ctx.createGain();
    src.connect(gain).connect(this.ctx.destination);
    const startAt = this.ctx.currentTime + cue.delaySec;
    // Fade in only when the music is starting fresh at its head (not when resuming mid-track).
    const fresh = cue.trackOffsetSec <= this.music.startInTrackSec + 0.01;
    if (fresh && this.music.fadeInSec > 0) {
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(this.music.volume, startAt + this.music.fadeInSec);
    } else {
      gain.gain.setValueAtTime(this.music.volume, startAt);
    }
    src.start(startAt, cue.trackOffsetSec);
    this.musicSource = src;
    this.musicGain = gain;
  }

  private stopMusic(): void {
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        /* already stopped */
      }
      this.musicSource.disconnect();
      this.musicSource = undefined;
    }
    this.musicGain = undefined;
  }

  stop(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        /* already stopped */
      }
      this.source.disconnect();
      this.source = undefined;
    }
    this.stopMusic();
  }

  /** Drop the cached synth buffer + log when the config changes. The music track persists. */
  invalidate(): void {
    this.stop();
    this.buffer = undefined;
    this.log = undefined;
  }
}
