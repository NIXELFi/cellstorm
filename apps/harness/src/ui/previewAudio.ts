// Web Audio glue for the harness preview soundtrack. Re-sims the battle in-browser (deterministic),
// builds the SAME AudioScore the renderer uses, synthesizes it once into an AudioBuffer, and plays
// it in lockstep with 1x playback. This is the audio half of WYSIWYG — what you hear here is what
// the rendered MP4 will carry. Decision rules live in ./previewAudioLogic (unit-tested).

import { runBattle, type BattleConfig } from "@cellstorm/sim";
import { buildAudioScore, renderScore } from "@cellstorm/audio";
import { audioOffsetSec } from "./previewAudioLogic";

const FPS = 60;

export class PreviewAudio {
  private ctx?: AudioContext;
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private bufferKey = ""; // config identity the current buffer was built for

  /** Build (and cache) the soundtrack buffer for a config. Cheap re-sim + pure synth. */
  private ensureBuffer(config: BattleConfig): AudioBuffer {
    if (!this.ctx) this.ctx = new AudioContext();
    const key = `${config.seed}:${config.teamCount}:${config.powers.join(",")}`;
    if (this.buffer && this.bufferKey === key) return this.buffer;

    const { log } = runBattle(config);
    const score = buildAudioScore(log, FPS);
    const sr = this.ctx.sampleRate;
    const { left, right } = renderScore(score, sr);
    const buf = this.ctx.createBuffer(2, left.length, sr);
    buf.getChannelData(0).set(left);
    buf.getChannelData(1).set(right);
    this.buffer = buf;
    this.bufferKey = key;
    return buf;
  }

  /** Start the soundtrack at the offset matching `frame` (resuming AudioContext if suspended). */
  start(config: BattleConfig, frame: number): void {
    const buf = this.ensureBuffer(config);
    if (!this.ctx) return;
    void this.ctx.resume(); // browsers start the context suspended until a user gesture
    this.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    const offset = Math.min(audioOffsetSec(frame, FPS), buf.duration);
    src.start(0, offset);
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

  /** Drop the cached buffer when the config changes so the next start rebuilds it. */
  invalidate(): void {
    this.stop();
    this.buffer = undefined;
    this.bufferKey = "";
  }
}
