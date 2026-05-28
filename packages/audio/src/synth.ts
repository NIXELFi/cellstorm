// Pure synthesis: an AudioScore -> stereo Float32 PCM. No Math.random, no wall clock — same input,
// same samples. Each note is an oscillator (a small harmonic series for the richer timbres, so they
// stay alias-light) shaped by an analytic envelope, gained, and equal-power panned into the mix.
// The master is soft-clipped with tanh so a hot stack of notes saturates musically instead of
// clipping into [-1, 1] hard edges.

import type { AudioScore, EnvShape, Note, Timbre } from "./types";

// Deterministic value noise for the "noise" timbre — a hashed pseudo-random keyed by sample index,
// so it's reproducible (no Math.random).
function hashNoise(i: number): number {
  let x = (i * 0x9e3779b1) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca77);
  x ^= x >>> 13;
  return (x >>> 0) / 0xffffffff * 2 - 1;
}

/** One oscillator sample at phase (radians) for a timbre. Harmonic sums kept short for speed. */
function osc(timbre: Timbre, phase: number, sampleIndex: number): number {
  switch (timbre) {
    case "sine":
      return Math.sin(phase);
    case "triangle":
      // odd harmonics, 1/n^2, alternating sign -> triangle-ish
      return (
        Math.sin(phase) -
        Math.sin(3 * phase) / 9 +
        Math.sin(5 * phase) / 25 -
        Math.sin(7 * phase) / 49
      ) * (8 / (Math.PI * Math.PI));
    case "square":
      return (Math.sin(phase) + Math.sin(3 * phase) / 3 + Math.sin(5 * phase) / 5 + Math.sin(7 * phase) / 7) * (4 / Math.PI);
    case "saw":
      return (
        Math.sin(phase) - Math.sin(2 * phase) / 2 + Math.sin(3 * phase) / 3 - Math.sin(4 * phase) / 4 + Math.sin(5 * phase) / 5
      ) * (2 / Math.PI);
    case "pulse":
      // narrow pulse ~ sum of cosines; bright and reedy
      return (Math.sin(phase) + Math.sin(2 * phase) / 2 + Math.sin(3 * phase) / 3) * 0.7;
    case "bell":
      // inharmonic partials -> metallic/bell
      return (Math.sin(phase) + Math.sin(2.76 * phase) * 0.5 + Math.sin(5.4 * phase) * 0.25) * 0.6;
    case "noise":
      return hashNoise(sampleIndex);
    default:
      return Math.sin(phase);
  }
}

/** Envelope amplitude at fractional progress p in [0,1] for the note's duration. */
function envelope(env: EnvShape, p: number): number {
  if (p < 0 || p > 1) return 0;
  switch (env) {
    case "pluck": {
      // ~3ms attack ramp then exponential decay across the note
      const attack = 0.02;
      const a = p < attack ? p / attack : 1;
      return a * Math.exp(-4.5 * p);
    }
    case "pad": {
      // slow attack, gentle plateau, slow release (raised-cosine-ish)
      const atk = 0.25, rel = 0.4;
      if (p < atk) return 0.5 - 0.5 * Math.cos((p / atk) * Math.PI);
      if (p > 1 - rel) return 0.5 - 0.5 * Math.cos(((1 - p) / rel) * Math.PI);
      return 1;
    }
    case "blip": {
      // tiny attack, fast decay
      const attack = 0.05;
      const a = p < attack ? p / attack : 1;
      return a * Math.exp(-9 * p);
    }
    default:
      return Math.exp(-4 * p);
  }
}

export interface StereoPcm {
  left: Float32Array;
  right: Float32Array;
}

export function renderScore(score: AudioScore, sampleRate: number): StereoPcm {
  const total = Math.ceil(score.duration * sampleRate);
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  const twoPi = Math.PI * 2;

  for (const n of score.notes) {
    const start = Math.floor(n.t * sampleRate);
    const len = Math.max(1, Math.floor(n.dur * sampleRate));
    const end = Math.min(total, start + len);
    if (start >= total || end <= 0) continue;

    // Equal-power pan: pan -1 -> full left, +1 -> full right.
    const angle = ((n.pan + 1) / 2) * (Math.PI / 2);
    const gl = Math.cos(angle) * n.gain;
    const gr = Math.sin(angle) * n.gain;

    const f0 = n.freq;
    const f1 = n.freqEnd ?? n.freq;
    let phase = 0;
    for (let i = Math.max(0, start); i < end; i++) {
      const local = i - start;
      const p = local / len; // 0..1 across the note
      // linear frequency glide
      const freq = f0 + (f1 - f0) * p;
      phase += (twoPi * freq) / sampleRate;
      const s = osc(n.timbre, phase, i) * envelope(n.env, p);
      left[i]! += s * gl;
      right[i]! += s * gr;
    }
  }

  // Master soft-clip: tanh saturates a hot mix into [-1,1] musically (with headroom trim first).
  const drive = 0.8;
  for (let i = 0; i < total; i++) {
    left[i] = Math.tanh(left[i]! * drive);
    right[i] = Math.tanh(right[i]! * drive);
  }
  return { left, right };
}
