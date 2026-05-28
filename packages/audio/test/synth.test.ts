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

  test("output stays within [-1, 1] even when many loud notes stack", () => {
    const notes: Note[] = [];
    for (let i = 0; i < 50; i++) notes.push(note({ t: 0.1, gain: 1, freq: 200 + i }));
    const { left, right } = renderScore({ duration: 1, notes }, SR);
    for (const x of left) expect(Math.abs(x)).toBeLessThanOrEqual(1);
    for (const x of right) expect(Math.abs(x)).toBeLessThanOrEqual(1);
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

  test("renders every timbre and envelope without producing NaN", () => {
    const timbres = ["sine", "triangle", "square", "saw", "pulse", "bell", "noise"] as const;
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
});
