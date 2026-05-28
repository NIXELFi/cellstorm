// Pure synthesis: an AudioScore -> stereo Float32 PCM. No Math.random, no wall clock — same input,
// same samples. Each note is an oscillator shaped by an analytic envelope, gained, and equal-power
// panned into the mix. Everything is deliberately SOFT: timbres are short, gently-rolled-off
// harmonic sums (no raw square/saw/pulse), the master is lightly driven (not slammed), and a gentle
// one-pole high-cut takes the edge off — so a busy mix stays warm instead of harsh.

import type { AudioScore, EnvShape, Note, Timbre } from "./types";

// Deterministic value noise for the "noise" timbre — hashed by sample index (no Math.random).
function hashNoise(i: number): number {
  let x = (i * 0x9e3779b1) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca77);
  x ^= x >>> 13;
  return ((x >>> 0) / 0xffffffff) * 2 - 1;
}

/** One oscillator sample at phase (radians). Soft, sine-based — a clean "boop" palette. */
function osc(timbre: Timbre, phase: number, sampleIndex: number): number {
  switch (timbre) {
    case "sine":
      return Math.sin(phase);
    case "triangle":
      // odd harmonics, 1/n^2 — soft, mostly fundamental
      return (Math.sin(phase) - Math.sin(3 * phase) / 9 + Math.sin(5 * phase) / 25) * (8 / (Math.PI * Math.PI));
    case "boop":
      // mostly sine with a faint 2nd harmonic — a rounded, modernized 8-bit doot/boop
      return (Math.sin(phase) + 0.16 * Math.sin(2 * phase)) / 1.16;
    case "bell":
      // soft inharmonic partials, gently scaled down (used sparingly)
      return (Math.sin(phase) + 0.3 * Math.sin(2.76 * phase) + 0.12 * Math.sin(5.4 * phase)) / 1.42;
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
      // soft ~8ms attack then a gentle exponential decay (rings longer than v1 -> less staccato)
      const attack = 0.03;
      const a = p < attack ? p / attack : 1;
      return a * Math.exp(-3 * p);
    }
    case "pad": {
      // slow raised-cosine attack, plateau, slow release
      const atk = 0.3, rel = 0.45;
      if (p < atk) return 0.5 - 0.5 * Math.cos((p / atk) * Math.PI);
      if (p > 1 - rel) return 0.5 - 0.5 * Math.cos(((1 - p) / rel) * Math.PI);
      return 1;
    }
    case "blip": {
      const attack = 0.06;
      const a = p < attack ? p / attack : 1;
      return a * Math.exp(-7 * p);
    }
    default:
      return Math.exp(-3 * p);
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

    const angle = ((n.pan + 1) / 2) * (Math.PI / 2); // equal-power pan
    const gl = Math.cos(angle) * n.gain;
    const gr = Math.sin(angle) * n.gain;

    const f0 = n.freq;
    const f1 = n.freqEnd ?? n.freq;
    let phase = 0;
    for (let i = Math.max(0, start); i < end; i++) {
      const local = i - start;
      const p = local / len;
      const freq = f0 + (f1 - f0) * p;
      phase += (twoPi * freq) / sampleRate;
      const s = osc(n.timbre, phase, i) * envelope(n.env, p);
      left[i]! += s * gl;
      right[i]! += s * gr;
    }
  }

  // Master chain. (1) Band-limit: a one-pole HIGH-pass (~45Hz) removes inaudible sub-bass — that
  // rumble is mostly felt as limiter pumping, not heard, and a stack of deep explosion booms driving
  // a brick-wall limiter is what produced the "clipping" crackle — then a gentle high-cut (~6kHz)
  // softens the top. (2) A brick-wall peak LIMITER that GUARANTEES the output never exceeds `ceiling`
  // (< full scale): instant attack (a peak can never slip through and clip) with a SLOW release so it
  // rides the level smoothly instead of distorting low-frequency cycles. Same gain on both channels.
  const dt = 1 / sampleRate;
  const lpA = dt / (1 / (twoPi * 6000) + dt);
  const rcHp = 1 / (twoPi * 45);
  const hpA = rcHp / (rcHp + dt);
  let lpL = 0, lpR = 0, hpL = 0, hpR = 0, prevL = 0, prevR = 0;
  for (let i = 0; i < total; i++) {
    const xl = left[i]!, xr = right[i]!;
    hpL = hpA * (hpL + xl - prevL); // high-pass
    hpR = hpA * (hpR + xr - prevR);
    prevL = xl; prevR = xr;
    lpL += lpA * (hpL - lpL); // then low-pass (band-limited)
    lpR += lpA * (hpR - lpR);
    left[i] = lpL;
    right[i] = lpR;
  }

  // Conservative ceiling: well below full scale so even the lossy AAC encoder's overshoot can't
  // reach 0 dBFS (no hard clipping, ever).
  const ceiling = 0.8;
  const releaseCoef = Math.exp(-1 / (sampleRate * 0.25)); // ~250ms release — smooth, no bass pumping
  let gain = 1;
  for (let i = 0; i < total; i++) {
    const peak = Math.max(Math.abs(left[i]!), Math.abs(right[i]!));
    const need = peak > ceiling ? ceiling / peak : 1; // gain that would tame THIS sample
    // Instant attack: clamp down immediately so |out| <= ceiling this very sample. Slow release up.
    gain = need < gain ? need : need + (gain - need) * releaseCoef;
    left[i] = left[i]! * gain;
    right[i] = right[i]! * gain;
  }
  return { left, right };
}
