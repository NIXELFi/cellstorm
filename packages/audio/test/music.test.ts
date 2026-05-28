import { describe, test, expect } from "vitest";
import { makeKey, degreeToFreq, semitoneFreq, makeVoices, beatSeconds, chordFreqs } from "../src/music";

describe("makeKey", () => {
  test("is deterministic for a seed", () => {
    expect(makeKey(42)).toEqual(makeKey(42));
  });

  test("uses a major pentatonic scale (all mutually consonant)", () => {
    const k = makeKey(7);
    expect(k.scale).toEqual([0, 2, 4, 7, 9]);
  });

  test("backing chord is a fixed, consonant major 6 (no progression)", () => {
    const k = makeKey(7);
    expect(k.chordSemitones).toEqual([0, 4, 7, 9]);
    // no progression / mode / chordBeats fields anymore
    expect((k as unknown as Record<string, unknown>).progression).toBeUndefined();
  });

  test("tempo is calm and the root is audible", () => {
    for (const seed of [0, 1, 99, 1234, 55555]) {
      const k = makeKey(seed);
      expect(k.bpm).toBeGreaterThanOrEqual(80);
      expect(k.bpm).toBeLessThanOrEqual(120);
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

describe("semitoneFreq / chordFreqs", () => {
  test("semitoneFreq is equal temperament from the root", () => {
    const k = makeKey(3);
    expect(semitoneFreq(k, 0, 0)).toBeCloseTo(k.rootFreq, 6);
    expect(semitoneFreq(k, 12, 0)).toBeCloseTo(k.rootFreq * 2, 4);
  });
  test("chordFreqs returns the fixed backing chord's frequencies", () => {
    const k = makeKey(3);
    const freqs = chordFreqs(k, 0);
    expect(freqs).toHaveLength(k.chordSemitones.length);
    expect(freqs[0]).toBeCloseTo(k.rootFreq, 4);
    for (let i = 1; i < freqs.length; i++) expect(freqs[i]!).toBeGreaterThan(freqs[i - 1]!);
  });
});

describe("makeVoices", () => {
  test("one voice per team, deterministic", () => {
    const powers = ["Tank", "Berserker", "Sniper"];
    expect(makeVoices(42, powers)).toEqual(makeVoices(42, powers));
    expect(makeVoices(42, powers)).toHaveLength(3);
  });

  test("each team owns a fixed pentatonic degree (distinct, consonant)", () => {
    const k = makeKey(42);
    const voices = makeVoices(42, ["Tank", "Berserker", "Sniper", "Vampire", "Regen"]);
    for (const v of voices) {
      expect(v.degree).toBeGreaterThanOrEqual(0);
      expect(v.degree).toBeLessThan(k.scale.length);
    }
    // first five teams get distinct degrees of the pentatonic scale
    expect(new Set(voices.map((v) => v.degree)).size).toBe(5);
  });

  test("timbre follows the power archetype, all soft/sine-based", () => {
    const voices = makeVoices(1, ["Tank", "Berserker", "Sniper", "Magnet", "Vampire"]);
    expect(voices[0]!.timbre).toBe("sine");
    expect(voices[1]!.timbre).toBe("boop");
    expect(voices[2]!.timbre).toBe("bell");
    expect(voices[3]!.timbre).toBe("triangle");
    expect(voices[4]!.timbre).toBe("sine");
    for (const v of voices) expect(["sine", "triangle", "boop", "bell"]).toContain(v.timbre);
  });

  test("pans spread across the stereo field within [-1,1]", () => {
    const voices = makeVoices(1, ["Tank", "Berserker", "Sniper", "Vampire"]);
    const pans = voices.map((v) => v.pan);
    for (const p of pans) {
      expect(p).toBeGreaterThanOrEqual(-1);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(new Set(pans).size).toBeGreaterThan(1);
  });
});

describe("beatSeconds", () => {
  test("converts bpm to seconds per beat", () => {
    const k = { ...makeKey(0), bpm: 120 };
    expect(beatSeconds(k)).toBeCloseTo(0.5, 6);
  });
});
