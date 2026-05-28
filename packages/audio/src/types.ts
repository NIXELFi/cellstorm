// Audio types. An AudioScore is the deterministic, render-target-agnostic intermediate between the
// battle log and actual sound: a flat list of timed Notes (times in SECONDS). The synth turns it
// into PCM; the same score drives the Node WAV mux and the browser Web Audio preview (WYSIWYG).

/** Oscillator timbre. Built from a small harmonic series in the synth (alias-light). */
export type Timbre = "sine" | "triangle" | "square" | "saw" | "pulse" | "bell" | "noise";

/** Amplitude envelope shape for a note. */
export type EnvShape =
  | "pluck" // fast attack, exponential decay (most events)
  | "pad" // slow attack, sustain, slow release (winner chord, bed swells)
  | "blip"; // very short transient (projectiles, beat pulse)

export interface Note {
  /** Start time in seconds. */
  t: number;
  /** Duration in seconds (envelope total length). */
  dur: number;
  /** Pitch in Hz at note start. */
  freq: number;
  /** Optional pitch at note end (linear glide); defaults to freq (no glide). */
  freqEnd?: number;
  timbre: Timbre;
  env: EnvShape;
  /** Peak linear gain, 0..1 (pre-master). */
  gain: number;
  /** Stereo pan, -1 (left) .. +1 (right). */
  pan: number;
}

export interface AudioScore {
  /** Total length in seconds (video length); the synth allocates this many samples. */
  duration: number;
  notes: Note[];
}

/** A team's musical identity, derived deterministically from seed + team index + power. */
export interface Voice {
  /** Base frequency (the team's chord tone, in the chosen octave) in Hz. */
  freq: number;
  /** Scale-degree index of the team's chord tone within the key (for octave shifts). */
  degree: number;
  timbre: Timbre;
  /** Baseline stereo pan for the team, -1..+1. */
  pan: number;
}

export interface Key {
  /** Root frequency (Hz) of the tonic in the base octave. */
  rootFreq: number;
  /** Semitone offsets of the scale degrees from the root (pentatonic: 5 entries). */
  scale: number[];
  /** Tempo in beats per minute. */
  bpm: number;
  /** Human-readable label, e.g. "A minor pentatonic @ 112bpm" (for debugging). */
  label: string;
}
