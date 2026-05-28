// Musical foundation, derived deterministically from the battle seed. The harmony is STATIC and
// fixed for the whole battle: one major-pentatonic scale (every note mutually consonant) over a
// single lush major-6 backing chord. Each team owns ONE pentatonic note that never changes — so
// everything always sounds pleasant together, with no rotating melody.

import { makePrng, randInt, type Prng } from "@cellstorm/sim";
import type { Key, Timbre, Voice } from "./types";

/** Third RNG stream, disjoint from gameplay (sim) and cosmetics (renderer). */
export const AUDIO_SALT = 0x5bd1e995;

// Major pentatonic — there are no dissonant intervals within it, so any mix of these notes is
// consonant no matter the order or combination.
const MAJOR_PENTATONIC = [0, 2, 4, 7, 9];
// A single fixed, warm backing chord (major 6: root, M3, P5, M6) — all consonant with the scale.
const CHORD_MAJOR6 = [0, 4, 7, 9];

const SEMITONE = Math.pow(2, 1 / 12);
const A2 = 110;
// Comfortable low tonics (A2..E3-ish) so the bed sits low and event notes ride above it.
const ROOT_CHOICES = [0, 2, 3, 5, 7].map((semis) => A2 * Math.pow(SEMITONE, semis));

export function audioPrng(seed: number): Prng {
  return makePrng((seed ^ AUDIO_SALT) >>> 0);
}

export function makeKey(seed: number): Key {
  const rng = audioPrng(seed);
  const rootFreq = ROOT_CHOICES[randInt(rng, ROOT_CHOICES.length)]!;
  const bpm = 80 + randInt(rng, 41); // 80..120 — calm
  return { rootFreq, scale: [...MAJOR_PENTATONIC], chordSemitones: [...CHORD_MAJOR6], bpm, label: `pentatonic @ ${bpm}bpm` };
}

/**
 * Frequency for a pentatonic scale degree. `degree` may exceed the scale length: it wraps across
 * octaves (degree === scale.length is one octave above degree 0). `octaveShift` adds whole octaves.
 */
export function degreeToFreq(key: Key, degree: number, octaveShift: number): number {
  const n = key.scale.length;
  const oct = Math.floor(degree / n) + octaveShift;
  const idx = ((degree % n) + n) % n;
  return key.rootFreq * Math.pow(SEMITONE, key.scale[idx]! + 12 * oct);
}

/** Frequency for an absolute semitone offset from the root (for the fixed backing chord). */
export function semitoneFreq(key: Key, semis: number, octaveShift: number): number {
  return key.rootFreq * Math.pow(SEMITONE, semis + 12 * octaveShift);
}

/** The fixed backing chord's frequencies at the given octave. */
export function chordFreqs(key: Key, octaveShift: number): number[] {
  return key.chordSemitones.map((s) => semitoneFreq(key, s, octaveShift));
}

export function beatSeconds(key: Key): number {
  return 60 / key.bpm;
}

// Power -> archetype timbre, ALL SOFT and sine-based (no raw square/saw/pulse, no piano). Mirrors
// the visual archetypes in render/glyphs.ts so each team still SOUNDS like it LOOKS, gently.
const POWER_TIMBRE: Record<string, Timbre> = {
  // defensive -> soft sine
  Tank: "sine", Goliath: "sine", Brute: "sine", Shielder: "sine", Reflector: "sine",
  // aggressive-fast -> boop (the videogamey doot)
  Berserker: "boop", Swift: "boop", Charger: "boop", Frenzy: "boop",
  // burst-ranged -> soft bell (sparingly)
  Glasshammer: "bell", Sniper: "bell", Bomb: "bell",
  // control -> triangle
  Magnet: "triangle", Stunner: "triangle", Plague: "triangle",
  // sustain-support -> soft sine
  Vampire: "sine", Regen: "sine", Lifebloom: "sine", Necromancer: "sine", Splitter: "sine",
};

function timbreFor(power: string): Timbre {
  return POWER_TIMBRE[power] ?? "sine";
}

/**
 * One Voice per team. Each team is permanently assigned a distinct pentatonic degree (so up to 5
 * teams get distinct, mutually-consonant notes; a 6th wraps to the root an octave context), a soft
 * archetype timbre, and a stereo pan. The note NEVER changes during the battle.
 */
export function makeVoices(seed: number, powers: string[]): Voice[] {
  const n = powers.length;
  return powers.map((power, team) => ({
    degree: team % MAJOR_PENTATONIC.length,
    octave: 1 + Math.floor(team / MAJOR_PENTATONIC.length),
    timbre: timbreFor(power),
    pan: n > 1 ? (team / (n - 1)) * 2 - 1 : 0,
  }));
}
