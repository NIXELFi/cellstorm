import { describe, test, expect } from "vitest";
import { normalizeConfig, type BattleConfig, type BattleLog, type SimEvent } from "@cellstorm/sim";
import { buildAudioScore, eventNotes, bedNotes } from "../src/score";
import { makeKey, makeVoices, degreeToFreq } from "../src/music";

const FPS = 60;

function cfg(powers: string[], seed = 1): BattleConfig {
  return normalizeConfig({ seed, teamCount: powers.length, powers });
}
function log(config: BattleConfig, events: SimEvent[], durationTicks: number, totalTicks = durationTicks, winner = 0): BattleLog {
  return { config, events, timeline: [], durationTicks, totalTicks, winner };
}

describe("buildAudioScore", () => {
  test("is deterministic", () => {
    const c = cfg(["Tank", "Berserker"]);
    const events: SimEvent[] = [
      { type: "death", tick: 60, cellId: 1, x: 140, y: 200, team: 0 },
      { type: "leadChange", tick: 120, team: 1 },
      { type: "battleEnd", tick: 300, winner: 1 },
    ];
    expect(buildAudioScore(log(c, events, 300, 348, 1), FPS)).toEqual(buildAudioScore(log(c, events, 300, 348, 1), FPS));
  });

  test("duration equals totalTicks / fps", () => {
    const c = cfg(["Tank", "Berserker"]);
    expect(buildAudioScore(log(c, [], 300, 360, 0), FPS).duration).toBeCloseTo(6, 6);
  });
});

describe("eventNotes — death (one fixed note per team, no rotation)", () => {
  test("a team's death is ALWAYS the same fixed note, regardless of when it happens", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    const voices = makeVoices(c.seed, c.powers);
    const events: SimEvent[] = [
      { type: "death", tick: 30, cellId: 1, x: 140, y: 0, team: 0 }, // early
      { type: "death", tick: 280, cellId: 2, x: 140, y: 0, team: 0 }, // late
    ];
    const deaths = eventNotes(log(c, events, 300, 300, 0), key, voices, FPS).filter((n) => n.env === "pluck");
    expect(deaths[0]!.freq).toBeCloseTo(deaths[1]!.freq, 6); // no octave climb, no rotation
    // and it's exactly the team's assigned pentatonic note
    expect(deaths[0]!.freq).toBeCloseTo(degreeToFreq(key, voices[0]!.degree, voices[0]!.octave), 6);
  });

  test("different teams play distinct (but consonant) fixed notes", () => {
    const c = cfg(["Tank", "Berserker", "Sniper"]);
    const key = makeKey(c.seed);
    const voices = makeVoices(c.seed, c.powers);
    const events: SimEvent[] = [0, 1, 2].map((team) => ({ type: "death", tick: 60, cellId: team, x: 140, y: 0, team }));
    const freqs = eventNotes(log(c, events, 300, 300, 0), key, voices, FPS).filter((n) => n.env === "pluck").map((n) => n.freq);
    expect(new Set(freqs.map((f) => f.toFixed(2))).size).toBe(3);
  });

  test("panned by x", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    const voices = makeVoices(c.seed, c.powers);
    const events: SimEvent[] = [
      { type: "death", tick: 60, cellId: 1, x: 0, y: 0, team: 0 },
      { type: "death", tick: 60, cellId: 2, x: 280, y: 0, team: 0 },
    ];
    const deaths = eventNotes(log(c, events, 300, 300, 0), key, voices, FPS).filter((n) => n.env === "pluck");
    expect(deaths[0]!.pan).toBeLessThan(deaths[1]!.pan);
  });
});

describe("eventNotes — other events (all from the fixed harmony)", () => {
  test("explosion makes a low boom below the root with a downward pitch drop", () => {
    const c = cfg(["Bomb", "Tank"]);
    const key = makeKey(c.seed);
    const voices = makeVoices(c.seed, c.powers);
    const notes = eventNotes(log(c, [{ type: "explosion", tick: 60, x: 140, y: 0, team: 0 }], 300, 300, 0), key, voices, FPS);
    const boom = notes.find((n) => n.freq < key.rootFreq);
    expect(boom).toBeDefined();
    expect(boom!.freqEnd!).toBeLessThan(boom!.freq);
  });

  test("projectileFire makes a short, quiet, soft blip", () => {
    const c = cfg(["Sniper", "Tank"]);
    const key = makeKey(c.seed);
    const voices = makeVoices(c.seed, c.powers);
    const blip = eventNotes(log(c, [{ type: "projectileFire", tick: 60, team: 0 }], 300, 300, 0), key, voices, FPS).find((n) => n.env === "blip");
    expect(blip).toBeDefined();
    expect(blip!.dur).toBeLessThan(0.2);
    expect(blip!.gain).toBeLessThan(0.25);
  });

  test("leadChange arpeggiates the fixed backing chord (>= 3 rising notes), identical every time", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    const voices = makeVoices(c.seed, c.powers);
    const arp = (tick: number) =>
      eventNotes(log(c, [{ type: "leadChange", tick, team: 1 }], 300, 300, 0), key, voices, FPS).map((n) => n.freq);
    const a = arp(60);
    expect(a.length).toBeGreaterThanOrEqual(3);
    const sorted = [...a].sort((x, y) => x - y);
    expect(a).toEqual(sorted); // ascending
    expect(arp(240)).toEqual(a); // same notes no matter when it happens (no rotation)
  });

  test("battleEnd resolves to a block chord plus an ascending arpeggio", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    const voices = makeVoices(c.seed, c.powers);
    const notes = eventNotes(log(c, [{ type: "battleEnd", tick: 300, winner: 1 }], 300, 360, 1), key, voices, FPS);
    const pads = notes.filter((n) => n.env === "pad");
    expect(pads.length).toBeGreaterThanOrEqual(3);
    expect(pads.filter((n) => Math.abs(n.t - pads[0]!.t) < 1e-9).length).toBeGreaterThanOrEqual(3);
    const arp = notes.filter((n) => n.env === "pluck").sort((a, b) => a.t - b.t);
    expect(arp.length).toBeGreaterThanOrEqual(3);
    expect(arp[arp.length - 1]!.freq).toBeGreaterThan(arp[0]!.freq);
  });

  test("a stalemate (winner < 0) produces no winner sting", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    const voices = makeVoices(c.seed, c.powers);
    expect(eventNotes(log(c, [{ type: "battleEnd", tick: 300, winner: -1 }], 300, 348, -1), key, voices, FPS)).toHaveLength(0);
  });
});

describe("bedNotes — one fixed chord, gently swelling", () => {
  test("lays down sustained chord triads (>= 3 simultaneous pad notes)", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    const pads = bedNotes(log(c, [], 300, 600, 0), key, 10).filter((n) => n.env === "pad");
    const byT = new Map<number, number>();
    for (const n of pads) byT.set(n.t, (byT.get(n.t) ?? 0) + 1);
    expect([...byT.values()].some((count) => count >= 3)).toBe(true);
  });

  test("the chord's pitches never change over the video (no rotation)", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    const duration = 12;
    const pads = bedNotes(log(c, [], 300, duration * 60, 0), key, duration);
    const distinct = (lo: number, hi: number) =>
      new Set(pads.filter((n) => n.t >= lo && n.t < hi).map((n) => n.freq.toFixed(3)));
    const early = distinct(0, duration / 2);
    const late = distinct(duration / 2, duration);
    expect([...late]).toEqual([...early]); // same pitch set, start to finish
  });

  test("spans the whole video", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    const duration = 10;
    const notes = bedNotes(log(c, [], 300, 600, 0), key, duration);
    const times = notes.map((n) => n.t);
    expect(Math.min(...times)).toBeLessThan(0.5);
    expect(Math.max(...times)).toBeGreaterThan(duration - 2);
    for (const n of notes) expect(n.t).toBeLessThanOrEqual(duration);
  });

  test("intensity swells where the action is densest", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    const duration = 10;
    const events: SimEvent[] = [];
    for (let i = 0; i < 40; i++) events.push({ type: "death", tick: 480 + i * 3, cellId: i, x: 140, y: 0, team: 0 });
    const notes = bedNotes(log(c, events, 600, 600, 0), key, duration);
    const avg = (ns: typeof notes) => ns.reduce((s, n) => s + n.gain, 0) / Math.max(1, ns.length);
    expect(avg(notes.filter((n) => n.t > 8))).toBeGreaterThan(avg(notes.filter((n) => n.t < 2)));
  });

  test("is deterministic", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    expect(bedNotes(log(c, [], 300, 600, 0), key, 10)).toEqual(bedNotes(log(c, [], 300, 600, 0), key, 10));
  });
});
