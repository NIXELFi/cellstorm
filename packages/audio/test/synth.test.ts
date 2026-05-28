import { describe, test, expect } from "vitest";
import { renderScore } from "../src/synth";
import type { AudioScore, Note } from "../src/types";

const SR = 8000;

function note(over: Partial<Note> = {}): Note {
  return { t: 0.1, dur: 0.2, freq: 440, timbre: "sine", env: "pluck", gain: 0.5, pan: 0, ...over };
}

function energy(a: Float32Array): number {
  let s = 0;
  for (const x of a) s += x * x;
  return s;
}

describe("renderScore", () => {
  test("is deterministic", () => {
    const score: AudioScore = { duration: 1, notes: [note(), note({ t: 0.5, freq: 660 })] };
    const a = renderScore(score, SR);
    const b = renderScore(score, SR);
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
    expect(Array.from(a.right)).toEqual(Array.from(b.right));
  });

  test("allocates ceil(duration * sampleRate) stereo samples", () => {
    const score: AudioScore = { duration: 1.5, notes: [] };
    const { left, right } = renderScore(score, SR);
    expect(left.length).toBe(Math.ceil(1.5 * SR));
    expect(right.length).toBe(left.length);
  });

  test("silence in -> silence out", () => {
    const { left, right } = renderScore({ duration: 1, notes: [] }, SR);
    expect(energy(left)).toBe(0);
    expect(energy(right)).toBe(0);
  });

  test("NEVER hard clips: a dense mix of hundreds of max-gain notes stays under the ceiling", () => {
    // Simulate the "many teams, lots of events" case that was clipping.
    const notes: Note[] = [];
    for (let i = 0; i < 600; i++) {
      notes.push(note({ t: (i % 100) * 0.005, dur: 0.5, gain: 1, freq: 120 + (i % 40) * 13, pan: (i % 3) - 1 }));
    }
    const { left, right } = renderScore({ duration: 1, notes }, SR);
    const peak = Math.max(...Array.from(left).map(Math.abs), ...Array.from(right).map(Math.abs));
    expect(peak).toBeLessThan(0.95); // a real ceiling below full-scale — no slamming to ±1
    expect(peak).toBeGreaterThan(0); // and it actually produced sound
  });

  test("a centered note has equal energy in both channels", () => {
    const { left, right } = renderScore({ duration: 1, notes: [note({ pan: 0 })] }, SR);
    expect(energy(left)).toBeCloseTo(energy(right), 5);
    expect(energy(left)).toBeGreaterThan(0);
  });

  test("a hard-left note puts its energy on the left", () => {
    const { left, right } = renderScore({ duration: 1, notes: [note({ pan: -1 })] }, SR);
    expect(energy(left)).toBeGreaterThan(energy(right) * 10);
  });

  test("a note produces no energy before its start time (causal)", () => {
    const { left } = renderScore({ duration: 1, notes: [note({ t: 0.5, dur: 0.2 })] }, SR);
    const beforeStart = left.slice(0, Math.floor(0.5 * SR) - 1);
    expect(energy(beforeStart)).toBe(0);
  });

  test("renders every (soft) timbre and envelope without producing NaN", () => {
    const timbres = ["sine", "triangle", "boop", "bell", "noise"] as const;
    const envs = ["pluck", "pad", "blip"] as const;
    const notes: Note[] = [];
    let t = 0;
    for (const timbre of timbres)
      for (const env of envs) {
        notes.push(note({ t, timbre, env }));
        t += 0.05;
      }
    const { left, right } = renderScore({ duration: t + 1, notes }, SR);
    for (const x of left) expect(Number.isFinite(x)).toBe(true);
    for (const x of right) expect(Number.isFinite(x)).toBe(true);
  });

  test("the soft melodic timbres produce audible energy", () => {
    for (const timbre of ["boop", "sine", "triangle", "bell"] as const) {
      const { left } = renderScore({ duration: 1, notes: [note({ timbre, gain: 0.8 })] }, SR);
      expect(energy(left)).toBeGreaterThan(0);
    }
  });

  test("attenuates inaudible sub-bass (so stacked low booms can't drive the limiter into crackle)", () => {
    const opts = { duration: 1, notes: [note({ timbre: "sine" as const, env: "pad" as const, dur: 0.8, gain: 0.8 })] };
    const sub = renderScore({ ...opts, notes: [{ ...opts.notes[0]!, freq: 30 }] }, SR).left;
    const mid = renderScore({ ...opts, notes: [{ ...opts.notes[0]!, freq: 300 }] }, SR).left;
    expect(energy(sub)).toBeLessThan(energy(mid) * 0.5); // sub-bass largely removed
  });

  test("boop is a distinct timbre, not the plain sine fallback", () => {
    const opts = { duration: 1, notes: [note({ timbre: "sine" as const, gain: 0.6, env: "pad" as const, dur: 0.5 })] };
    const sine = renderScore(opts, SR).left;
    const boop = renderScore({ ...opts, notes: [{ ...opts.notes[0]!, timbre: "boop" as const }] }, SR).left;
    let diff = 0;
    for (let i = 0; i < sine.length; i++) diff += Math.abs(sine[i]! - boop[i]!);
    expect(diff).toBeGreaterThan(1); // a faint harmonic makes it differ from a pure sine
  });
});
