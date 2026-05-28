import { describe, test, expect } from "vitest";
import { makeKey, degreeToFreq, makeVoices, beatSeconds } from "../src/music";

describe("makeKey", () => {
  test("is deterministic for a seed", () => {
    expect(makeKey(42)).toEqual(makeKey(42));
  });

  test("produces a pentatonic scale (5 degrees from the root)", () => {
    const k = makeKey(7);
    expect(k.scale).toHaveLength(5);
    expect(k.scale[0]).toBe(0); // root is degree 0
    // pentatonic spans within one octave, strictly ascending
    for (let i = 1; i < k.scale.length; i++) {
      expect(k.scale[i]!).toBeGreaterThan(k.scale[i - 1]!);
      expect(k.scale[i]!).toBeLessThan(12);
    }
  });

  test("tempo lands in a tasteful range and root is audible", () => {
    for (const seed of [0, 1, 99, 1234, 55555]) {
      const k = makeKey(seed);
      expect(k.bpm).toBeGreaterThanOrEqual(96);
      expect(k.bpm).toBeLessThanOrEqual(132);
      expect(k.rootFreq).toBeGreaterThan(40);
      expect(k.rootFreq).toBeLessThan(400);
    }
  });
});

describe("degreeToFreq", () => {
  test("degree 0 at octave 0 is the root frequency", () => {
    const k = makeKey(3);
    expect(degreeToFreq(k, 0, 0)).toBeCloseTo(k.rootFreq, 6);
  });

  test("one full scale of degrees is one octave up", () => {
    const k = makeKey(3);
    expect(degreeToFreq(k, k.scale.length, 0)).toBeCloseTo(k.rootFreq * 2, 4);
  });

  test("octave shift doubles per octave", () => {
    const k = makeKey(3);
    expect(degreeToFreq(k, 0, 1)).toBeCloseTo(k.rootFreq * 2, 4);
    expect(degreeToFreq(k, 0, -1)).toBeCloseTo(k.rootFreq / 2, 4);
  });
});

describe("makeVoices", () => {
  test("one voice per team, deterministic", () => {
    const powers = ["Tank", "Berserker", "Sniper"];
    const a = makeVoices(42, powers);
    const b = makeVoices(42, powers);
    expect(a).toHaveLength(3);
    expect(a).toEqual(b);
  });

  test("every voice frequency is a degree of the key", () => {
    const k = makeKey(42);
    const voices = makeVoices(42, ["Tank", "Berserker", "Sniper", "Vampire"]);
    for (const v of voices) {
      expect(v.freq).toBeGreaterThan(0);
      expect(v.degree).toBeGreaterThanOrEqual(0);
      expect(v.degree).toBeLessThan(k.scale.length);
    }
  });

  test("timbre follows the power archetype", () => {
    const voices = makeVoices(1, ["Tank", "Berserker", "Sniper", "Magnet", "Vampire"]);
    expect(voices[0]!.timbre).toBe("square"); // Tank = defensive/blocky
    expect(voices[1]!.timbre).toBe("saw"); // Berserker = aggressive
    expect(voices[2]!.timbre).toBe("bell"); // Sniper = burst/ranged
    expect(voices[3]!.timbre).toBe("pulse"); // Magnet = control
    expect(voices[4]!.timbre).toBe("triangle"); // Vampire = sustain/support
  });

  test("pans spread across the stereo field within [-1,1]", () => {
    const voices = makeVoices(1, ["Tank", "Berserker", "Sniper", "Vampire"]);
    const pans = voices.map((v) => v.pan);
    for (const p of pans) {
      expect(p).toBeGreaterThanOrEqual(-1);
      expect(p).toBeLessThanOrEqual(1);
    }
    // not all the same point
    expect(new Set(pans).size).toBeGreaterThan(1);
  });
});

describe("beatSeconds", () => {
  test("converts bpm to seconds per beat", () => {
    const k = { ...makeKey(0), bpm: 120 };
    expect(beatSeconds(k)).toBeCloseTo(0.5, 6);
  });
});
