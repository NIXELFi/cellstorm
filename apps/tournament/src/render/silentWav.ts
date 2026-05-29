// A format-matched silent track for the bracket/podium/intro scenes. Match clips carry a 44.1kHz /
// 16-bit / stereo synth WAV (muxed to AAC 192k by encode()); scenes must carry an AAC track in the
// SAME format or `ffmpeg -f concat -c copy` desyncs/breaks. Zero-filled PCM -> the package's pcmToWav.
import { pcmToWav } from "@cellstorm/audio";

export function silentWavBytes(durationSec: number, sampleRate = 44100): Uint8Array {
  const n = Math.max(1, Math.ceil(durationSec * sampleRate));
  return pcmToWav(new Float32Array(n), new Float32Array(n), sampleRate);
}
