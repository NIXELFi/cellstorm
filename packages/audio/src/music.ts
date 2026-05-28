// Musical foundation, derived deterministically from the battle seed. The whole point: a pentatonic
// scale + per-team chord tones means ANY combination of notes is consonant, so an honest, unscripted
// sim still sounds like music no matter what order things happen in.

import { makePrng, randInt, type Prng } from "@cellstorm/sim";
import type { Key, Timbre, Voice } from "./types";

/** Third RNG stream, disjoint from gameplay (sim) and cosmetics (renderer). */
export const AUDIO_SALT = 0x5bd1e995;

// Major and minor pentatonic, as semitone offsets from the root.
const MAJOR_PENTATONIC = [0, 2, 4, 7, 9];
const MINOR_PENTATONIC = [0, 3, 5, 7, 10];

// Tonic frequencies (Hz) for a handful of comfortable low-register roots (C2..B2-ish), so the bed
// sits low and event notes ride above it. Equal temperament from A2 = 110Hz.
const SEMITONE = Math.pow(2, 1 / 12);
const A2 = 110;
// Roots span an octave from C3 (~130.8) down/around; pick by seed.
const ROOT_CHOICES = [0, 2, 3, 5, 7, 8, 10].map((semis) => A2 * Math.pow(SEMITONE, semis));

export function audioPrng(seed: number): Prng {
  return makePrng((seed ^ AUDIO_SALT) >>> 0);
}

export function makeKey(seed: number): Key {
  const rng = audioPrng(seed);
  const rootFreq = ROOT_CHOICES[randInt(rng, ROOT_CHOICES.length)]!;
  const minor = rng() < 0.55; // lean minor — reads as tense/dramatic
  const scale = minor ? MINOR_PENTATONIC : MAJOR_PENTATONIC;
  const bpm = 96 + randInt(rng, 37); // 96..132
  const label = `${minor ? "minor" : "major"} pentatonic @ ${bpm}bpm`;
  return { rootFreq, scale: [...scale], bpm, label };
}

/**
 * Frequency for a scale degree. `degree` may exceed the scale length: it wraps across octaves
 * (degree === scale.length is one octave above degree 0). `octaveShift` adds whole octaves.
 */
export function degreeToFreq(key: Key, degree: number, octaveShift: number): number {
  const n = key.scale.length;
  const oct = Math.floor(degree / n) + octaveShift;
  const idx = ((degree % n) + n) % n;
  const semis = key.scale[idx]! + 12 * oct;
  return key.rootFreq * Math.pow(SEMITONE, semis);
}

export function beatSeconds(key: Key): number {
  return 60 / key.bpm;
}

// Power -> archetype timbre. Mirrors the visual archetypes in render/glyphs.ts (square=tanky,
// triangle=aggressive, diamond=burst, hexagon=control, circle=sustain) so each team SOUNDS like it
// LOOKS. Duplicated here as small cosmetic data rather than depending on the Pixi-bound render pkg.
const POWER_TIMBRE: Record<string, Timbre> = {
  // square / defensive
  Tank: "square", Goliath: "square", Brute: "square", Shielder: "square", Reflector: "square",
  // saw / aggressive-fast
  Berserker: "saw", Swift: "saw", Charger: "saw", Frenzy: "saw",
  // bell / burst-ranged
  Glasshammer: "bell", Sniper: "bell", Bomb: "bell",
  // pulse / control
  Magnet: "pulse", Stunner: "pulse", Plague: "pulse",
  // triangle / sustain-support
  Vampire: "triangle", Regen: "triangle", Lifebloom: "triangle", Necromancer: "triangle", Splitter: "triangle",
};

function timbreFor(power: string): Timbre {
  return POWER_TIMBRE[power] ?? "triangle";
}

/**
 * One Voice per team. Each team gets a distinct chord tone (so teams harmonize), a timbre from its
 * power's archetype, and a stereo pan spread across the field. Deterministic from seed + powers.
 */
export function makeVoices(seed: number, powers: string[]): Voice[] {
  const key = makeKey(seed);
  const n = powers.length;
  return powers.map((power, team) => {
    // Spread chord tones across the pentatonic degrees so adjacent teams differ.
    const degree = (team * 2) % key.scale.length;
    // Voices sit in the mid octave (one above the bed root).
    const freq = degreeToFreq(key, degree, 1);
    // Even stereo spread: team 0 -> left, last team -> right (single team -> center).
    const pan = n > 1 ? (team / (n - 1)) * 2 - 1 : 0;
    return { freq, degree, timbre: timbreFor(power), pan };
  });
}
