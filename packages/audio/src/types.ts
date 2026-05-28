// Audio types. An AudioScore is the deterministic, render-target-agnostic intermediate between the
// battle log and actual sound: a flat list of timed Notes (times in SECONDS). The synth turns it
// into PCM; the same score drives the Node WAV mux and the browser Web Audio preview (WYSIWYG).

/**
 * Oscillator timbre. All are deliberately SOFT and sine-based — a clean, "modernized 8-bit" doot/boop
 * palette (no raw square/saw/pulse, no bright piano), so a busy multi-team mix stays gentle.
 */
export type Timbre =
  | "sine" // pure, warmest
  | "triangle" // soft, mostly fundamental
  | "boop" // soft sine + a faint harmonic — the videogamey doot/boop
  | "bell" // soft inharmonic bell (sparingly)
  | "noise"; // only for the explosion "crack", low gain

/** Amplitude envelope shape for a note. */
export type EnvShape =
  | "pluck" // soft attack, gentle exponential decay (most event notes)
  | "pad" // slow attack, sustain, slow release (chords, bed)
  | "blip"; // very short, soft transient (beat pulse)

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

/**
 * A team's musical identity, derived deterministically from seed + team index. Each team owns ONE
 * fixed pitch (a degree of the shared pentatonic scale) for the whole battle — it never rotates, and
 * because the scale is pentatonic every team's note is consonant with every other's.
 */
export interface Voice {
  /** Fixed pentatonic scale-degree index this team always plays. */
  degree: number;
  /** Fixed octave offset for this team's note. */
  octave: number;
  timbre: Timbre;
  /** Baseline stereo pan for the team, -1..+1. */
  pan: number;
}

export interface Key {
  /** Root frequency (Hz) of the tonic in the base octave. */
  rootFreq: number;
  /** Semitone offsets of the MAJOR PENTATONIC scale degrees from the root (5 entries). */
  scale: number[];
  /** Semitone offsets of the single fixed backing chord (a lush, consonant major 6). */
  chordSemitones: number[];
  /** Tempo in beats per minute (for the bed's timing only — pitches never change). */
  bpm: number;
  /** Human-readable label (debugging). */
  label: string;
}
