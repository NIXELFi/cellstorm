// BattleLog -> AudioScore. The harmony is STATIC: one fixed major-6 backing chord and one fixed
// pentatonic note per team, so everything is consonant and nothing rotates. Events trigger their
// team's permanent note (or the fixed chord); the bed sustains that same chord throughout, only
// swelling in volume with the on-screen action. Pure and deterministic. Times in seconds (tick/fps).

import type { BattleLog, SimEvent } from "@cellstorm/sim";
import type { AudioScore, Key, Note, Voice } from "./types";
import { audioPrng, beatSeconds, chordFreqs, degreeToFreq, makeKey, makeVoices, semitoneFreq } from "./music";

const ARENA_W = 280; // base arena width, for panning by x (see config DEFAULTS.arena)
const BAR_BEATS = 4; // bed re-triggers the (same) chord each bar so it can swell with the action

function panFromX(x: number): number {
  const p = (x / ARENA_W) * 2 - 1;
  return p < -1 ? -1 : p > 1 ? 1 : p;
}
const sec = (tick: number, fps: number): number => tick / fps;

/** Notes driven directly by sim events — all drawn from the fixed harmony. */
export function eventNotes(log: BattleLog, key: Key, voices: Voice[], fps: number): Note[] {
  const notes: Note[] = [];

  for (const e of log.events) {
    switch (e.type) {
      case "death": {
        const v = voices[e.team] ?? voices[0]!;
        // The team's ONE permanent note — same pitch every time, panned by where it died.
        const freq = degreeToFreq(key, v.degree, v.octave);
        notes.push({ t: sec(e.tick, fps), dur: 0.4, freq, timbre: v.timbre, env: "pluck", gain: 0.16, pan: panFromX(e.x) });
        break;
      }
      case "explosion": {
        const freq = semitoneFreq(key, 0, -2); // low boom two octaves below the root
        notes.push({ t: sec(e.tick, fps), dur: 0.8, freq, freqEnd: freq * 0.7, timbre: "sine", env: "pluck", gain: 0.34, pan: panFromX(e.x) });
        notes.push({ t: sec(e.tick, fps), dur: 0.08, freq: freq * 8, timbre: "noise", env: "blip", gain: 0.1, pan: panFromX(e.x) });
        break;
      }
      case "projectileFire": {
        const v = voices[e.team] ?? voices[0]!;
        const freq = degreeToFreq(key, v.degree, v.octave + 1); // the team's note, an octave up, soft
        notes.push({ t: sec(e.tick, fps), dur: 0.1, freq, timbre: "sine", env: "blip", gain: 0.05, pan: v.pan });
        break;
      }
      case "leadChange": {
        // Arpeggiate the fixed backing chord, rising — a pleasant, identical momentum cue every time.
        const v = voices[e.team] ?? voices[0]!;
        const t = sec(e.tick, fps);
        chordFreqs(key, 1).forEach((freq, i) => {
          notes.push({ t: t + i * 0.1, dur: 0.4, freq, timbre: "boop", env: "pluck", gain: 0.16, pan: v.pan });
        });
        break;
      }
      case "battleEnd": {
        if (e.winner < 0) break; // stalemate: no triumphant sting
        const t = sec(e.tick, fps);
        // Resolving block chord (sustained) ...
        chordFreqs(key, 0).forEach((freq) => {
          notes.push({ t, dur: 2.0, freq, timbre: "sine", env: "pad", gain: 0.16, pan: 0 });
        });
        // ... with an ascending arpeggio (chord + the octave) on top.
        [...chordFreqs(key, 1), semitoneFreq(key, 12, 1)].forEach((freq, i) => {
          notes.push({ t: t + i * 0.12, dur: 0.5, freq, timbre: "boop", env: "pluck", gain: 0.2, pan: 0 });
        });
        break;
      }
      default:
        break;
    }
  }
  return notes;
}

/** Deaths-per-second intensity envelope in [0,1], sampled at `samples` points across the video. */
function intensityEnvelope(events: SimEvent[], fps: number, duration: number, samples: number): number[] {
  const win = 1.5;
  const deathTimes = events.filter((e) => e.type === "death").map((e) => e.tick / fps);
  const env: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / Math.max(1, samples - 1)) * duration;
    let count = 0;
    for (const dt of deathTimes) if (dt >= t - win && dt <= t + win) count++;
    env.push(Math.min(1, count / (2 * win) / 6));
  }
  return env;
}

/**
 * The continuous musical bed: the SINGLE fixed backing chord, sustained as a soft pad and re-voiced
 * each bar so its volume can swell with on-screen action density (a deaths/sec envelope) — but the
 * pitches never change. Plus a low root bass and a gentle sparkle on the chord tones when hot.
 */
export function bedNotes(log: BattleLog, key: Key, duration: number): Note[] {
  const notes: Note[] = [];
  const rng = audioPrng((log.config.seed ^ 0x1234) >>> 0);
  const beat = beatSeconds(key);
  const barLen = BAR_BEATS * beat;
  const barCount = Math.max(1, Math.ceil(duration / barLen));
  const env = intensityEnvelope(log.events, 60, duration, barCount);
  const chord = chordFreqs(key, 0);
  const rootBass = semitoneFreq(key, 0, -1);

  for (let i = 0; i < barCount; i++) {
    const t = i * barLen;
    if (t > duration) break;
    const intensity = env[i] ?? 0;
    const padGain = 0.05 + 0.05 * intensity;
    for (const freq of chord) {
      notes.push({ t, dur: barLen * 1.05, freq, timbre: "sine", env: "pad", gain: padGain, pan: 0 });
    }
    notes.push({ t, dur: barLen * 0.95, freq: rootBass, timbre: "sine", env: "pad", gain: 0.06 + 0.04 * intensity, pan: 0 });

    // A gentle melodic sparkle (boop) on the fixed chord tones when the action is hot.
    if (intensity > 0.35) {
      for (let b = 0; b < BAR_BEATS; b++) {
        if (rng() < intensity * 0.8) {
          const freq = chord[Math.floor(rng() * chord.length)]! * 2; // an octave up
          notes.push({ t: t + b * beat, dur: beat * 0.8, freq, timbre: "boop", env: "pluck", gain: 0.07 * intensity, pan: (rng() * 2 - 1) * 0.5 });
        }
      }
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
