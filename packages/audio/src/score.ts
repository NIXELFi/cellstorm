// BattleLog -> AudioScore. This is the creative core: it decides what every event sounds like and
// lays down a continuous musical bed underneath. Pure and deterministic — a function of the log
// only. Times are in seconds (tick / fps).

import type { BattleLog, SimEvent } from "@cellstorm/sim";
import type { AudioScore, Key, Note, Voice } from "./types";
import { audioPrng, beatSeconds, degreeToFreq, makeKey, makeVoices } from "./music";

const ARENA_W = 280; // base arena width, for panning by x (see config DEFAULTS.arena)

/** Equal-power-ish pan from an x coordinate in arena units, clamped to [-1, 1]. */
function panFromX(x: number): number {
  const p = (x / ARENA_W) * 2 - 1;
  return p < -1 ? -1 : p > 1 ? 1 : p;
}

/** Per-tick clock helper. */
const sec = (tick: number, fps: number): number => tick / fps;

/**
 * Notes driven directly by sim events. `key` and `voices` are passed in (derived once by the
 * caller) so this stays a pure mapping.
 */
export function eventNotes(log: BattleLog, key: Key, voices: Voice[], fps: number): Note[] {
  const notes: Note[] = [];
  const dur = Math.max(1, log.durationTicks);

  for (const e of log.events) {
    switch (e.type) {
      case "death": {
        const v = voices[e.team] ?? voices[0]!;
        // Octave rises with battle progress: cumulative deaths trace an ascending melodic arc that
        // peaks at the climax. progress 0..1 -> 0,1,2 octaves up over the team's chord tone.
        const progress = Math.min(1, e.tick / dur);
        const octave = Math.floor(progress * 2.999); // 0,1,2
        const freq = degreeToFreq(key, v.degree + octave * key.scale.length, 1);
        notes.push({
          t: sec(e.tick, fps), dur: 0.32, freq,
          timbre: v.timbre, env: "pluck", gain: 0.5, pan: panFromX(e.x),
        });
        break;
      }
      case "explosion": {
        // Low boom two octaves below the root, dropping a fifth, with a longer tail.
        const freq = degreeToFreq(key, 0, -2);
        notes.push({
          t: sec(e.tick, fps), dur: 0.7, freq, freqEnd: freq * 0.66,
          timbre: "sine", env: "pluck", gain: 0.85, pan: panFromX(e.x),
        });
        // A short noise transient for the "crack".
        notes.push({
          t: sec(e.tick, fps), dur: 0.12, freq: freq * 8,
          timbre: "noise", env: "blip", gain: 0.4, pan: panFromX(e.x),
        });
        break;
      }
      case "projectileFire": {
        const v = voices[e.team] ?? voices[0]!;
        // Quick, quiet, high descending "pew".
        const freq = degreeToFreq(key, v.degree, 3);
        notes.push({
          t: sec(e.tick, fps), dur: 0.09, freq, freqEnd: freq * 0.6,
          timbre: "sine", env: "blip", gain: 0.18, pan: v.pan,
        });
        break;
      }
      case "leadChange": {
        // Bright rising two-note bell motif: the team's tone, then up a step — the momentum cue.
        const v = voices[e.team] ?? voices[0]!;
        const t = sec(e.tick, fps);
        const f0 = degreeToFreq(key, v.degree, 2);
        const f1 = degreeToFreq(key, v.degree + 2, 2);
        notes.push({ t, dur: 0.45, freq: f0, timbre: "bell", env: "pluck", gain: 0.4, pan: v.pan });
        notes.push({ t: t + 0.12, dur: 0.5, freq: f1, timbre: "bell", env: "pluck", gain: 0.42, pan: v.pan });
        break;
      }
      case "battleEnd": {
        if (e.winner < 0) break; // stalemate: no triumphant sting
        const v = voices[e.winner] ?? voices[0]!;
        const t = sec(e.tick, fps);
        // Ascending arpeggio of the winner's chord (root, 3rd-ish, 5th-ish, octave) resolving up.
        const steps = [0, 2, 4, key.scale.length];
        steps.forEach((deg, i) => {
          notes.push({
            t: t + i * 0.11, dur: 0.6, freq: degreeToFreq(key, v.degree + deg, 2),
            timbre: "bell", env: "pluck", gain: 0.5, pan: v.pan,
          });
        });
        // A sustained pad chord underneath (root + octave).
        notes.push({ t, dur: 1.6, freq: degreeToFreq(key, v.degree, 1), timbre: "triangle", env: "pad", gain: 0.4, pan: 0 });
        notes.push({ t, dur: 1.6, freq: degreeToFreq(key, v.degree, 2), timbre: "sine", env: "pad", gain: 0.3, pan: 0 });
        break;
      }
      default:
        break;
    }
  }
  return notes;
}

/**
 * Build a deaths-per-second intensity envelope sampled at `samples` points across [0, duration].
 * Each value is in [0, 1] (a soft cap), used to swell the bed where the action is densest.
 */
function intensityEnvelope(events: SimEvent[], fps: number, duration: number, samples: number): number[] {
  const win = 1.5; // seconds of look-around for local death density
  const deathTimes = events.filter((e) => e.type === "death").map((e) => e.tick / fps);
  const env: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / Math.max(1, samples - 1)) * duration;
    let count = 0;
    for (const dt of deathTimes) if (dt >= t - win && dt <= t + win) count++;
    const perSec = count / (2 * win);
    env.push(Math.min(1, perSec / 6)); // ~6 deaths/sec saturates the swell
  }
  return env;
}

/**
 * The continuous musical bed: a low arpeggiated bassline + a soft beat pulse, in key at the seed
 * tempo, spanning the whole video. Amplitude swells with on-screen action density so the music
 * lifts toward the climax and the win.
 */
export function bedNotes(log: BattleLog, key: Key, duration: number): Note[] {
  const notes: Note[] = [];
  const rng = audioPrng(log.config.seed ^ 0x1234);
  const beat = beatSeconds(key);
  const step = beat / 2; // eighth notes
  const stepCount = Math.max(1, Math.ceil(duration / step));
  const env = intensityEnvelope(log.events, 60, duration, stepCount);

  // A simple repeating pentatonic walk for the bassline.
  const pattern = [0, 2, 1, 3];
  for (let i = 0; i < stepCount; i++) {
    const t = i * step;
    if (t > duration) break;
    const intensity = env[i] ?? 0;
    // Bass note (low octave), every step.
    const deg = pattern[i % pattern.length]!;
    const bassGain = 0.12 + 0.16 * intensity;
    notes.push({
      t, dur: step * 1.4, freq: degreeToFreq(key, deg, 0),
      timbre: "triangle", env: "pad", gain: bassGain, pan: 0,
    });
    // Soft beat pulse on the downbeats, intensifying with the action.
    if (i % 2 === 0) {
      notes.push({
        t, dur: 0.06, freq: degreeToFreq(key, 0, -1),
        timbre: "sine", env: "blip", gain: 0.1 + 0.14 * intensity, pan: 0,
      });
    }
    // A sparkle arp on top when the action is hot (adds melodic energy at the climax).
    if (intensity > 0.4 && rng() < intensity) {
      const sd = pattern[(i + 2) % pattern.length]!;
      notes.push({
        t, dur: step, freq: degreeToFreq(key, sd, 2),
        timbre: "bell", env: "pluck", gain: 0.12 * intensity, pan: (rng() * 2 - 1) * 0.6,
      });
    }
  }
  return notes;
}

export function buildAudioScore(log: BattleLog, fps = 60): AudioScore {
  const key = makeKey(log.config.seed);
  const voices = makeVoices(log.config.seed, log.config.powers);
  const duration = log.totalTicks / fps;
  const notes = [...bedNotes(log, key, duration), ...eventNotes(log, key, voices, fps)];
  return { duration, notes };
}
