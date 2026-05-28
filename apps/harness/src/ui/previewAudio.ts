// Web Audio glue for the harness preview soundtrack. Builds the SAME AudioScore the renderer uses,
// from the AUTHORITATIVE Node battle log (fetched from the bridge — NOT re-simulated in the browser,
// which could diverge), synthesizes it once into an AudioBuffer, and plays it in lockstep with 1x
// playback. So what you hear here is exactly what the rendered MP4 carries (same battle, same audio).

import { buildAudioScore, renderScore } from "@cellstorm/audio";
import type { BattleLog } from "@cellstorm/sim";
import { audioOffsetSec } from "./previewAudioLogic";

const FPS = 60;

export class PreviewAudio {
  private ctx?: AudioContext;
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private log?: BattleLog;

  /** Set the authoritative battle log to score. Invalidates the cached buffer if it changed. */
  setLog(log: BattleLog): void {
    if (this.log === log) return;
    this.log = log;
    this.buffer = undefined;
    this.stop();
  }

  private ensureBuffer(): AudioBuffer | undefined {
    if (!this.log) return undefined;
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.buffer) return this.buffer;
    const score = buildAudioScore(this.log, FPS);
    const sr = this.ctx.sampleRate;
    const { left, right } = renderScore(score, sr);
    const buf = this.ctx.createBuffer(2, left.length, sr);
    buf.getChannelData(0).set(left);
    buf.getChannelData(1).set(right);
    this.buffer = buf;
    return buf;
  }

  /** Start the soundtrack at the offset matching `frame` (resuming the context if suspended). */
  start(frame: number): void {
    const buf = this.ensureBuffer();
    if (!buf || !this.ctx) return;
    void this.ctx.resume(); // browsers start the context suspended until a user gesture
    this.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    src.start(0, Math.min(audioOffsetSec(frame, FPS), buf.duration));
    this.source = src;
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
  }

  /** Drop the cached buffer + log when the config changes. */
  invalidate(): void {
    this.stop();
    this.buffer = undefined;
    this.log = undefined;
  }
}
