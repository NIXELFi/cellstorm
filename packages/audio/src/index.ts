// Public surface of @cellstorm/audio — deterministic, render-target-agnostic sound for a battle.
// Pure (no DOM / Pixi / Node-only imports): the SAME code generates the WAV the renderer muxes and
// the PCM the harness plays through Web Audio, so preview == final (WYSIWYG), like the visuals.

import type { BattleLog } from "@cellstorm/sim";
import { buildAudioScore } from "./score";
import { renderScore } from "./synth";
import { pcmToWav } from "./wav";

export { buildAudioScore, eventNotes, bedNotes } from "./score";
export { renderScore } from "./synth";
export type { StereoPcm } from "./synth";
export { pcmToWav } from "./wav";
export { makeKey, makeVoices, degreeToFreq, beatSeconds, audioPrng, AUDIO_SALT } from "./music";
export type { AudioScore, Note, Voice, Key, Timbre, EnvShape } from "./types";

/** Convenience: battle log -> a ready-to-mux 16-bit stereo WAV. */
export function renderBattleAudioWav(log: BattleLog, fps = 60, sampleRate = 44100): Uint8Array {
  const score = buildAudioScore(log, fps);
  const { left, right } = renderScore(score, sampleRate);
  return pcmToWav(left, right, sampleRate);
}
