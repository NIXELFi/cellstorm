import { describe, test, expect } from "vitest";
import { normalizeConfig, type BattleConfig, type BattleLog, type SimEvent } from "@cellstorm/sim";
import { buildAudioScore, eventNotes, bedNotes } from "../src/score";
import { makeKey, makeVoices } from "../src/music";

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
    const l = log(c, events, 300, 348, 1);
    expect(buildAudioScore(l, FPS)).toEqual(buildAudioScore(l, FPS));
  });

  test("duration equals totalTicks / fps", () => {
    const c = cfg(["Tank", "Berserker"]);
    const l = log(c, [], 300, 360, 0);
    expect(buildAudioScore(l, FPS).duration).toBeCloseTo(6, 6);
  });
});

describe("eventNotes — death", () => {
  test("each death makes a plucked note, panned by x", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    const voices = makeVoices(c.seed, c.powers);
    const events: SimEvent[] = [
      { type: "death", tick: 60, cellId: 1, x: 0, y: 0, team: 0 }, // far left
      { type: "death", tick: 90, cellId: 2, x: 280, y: 0, team: 0 }, // far right
    ];
    const notes = eventNotes(log(c, events, 300, 300, 0), key, voices, FPS);
    const deaths = notes.filter((n) => n.env === "pluck");
    expect(deaths).toHaveLength(2);
    expect(deaths[0]!.t).toBeCloseTo(1, 6); // tick 60 / 60fps
    expect(deaths[0]!.pan).toBeLessThan(deaths[1]!.pan); // x=0 pans left of x=280
  });

  test("death octave rises as the battle nears its climax", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    const voices = makeVoices(c.seed, c.powers);
    const events: SimEvent[] = [
      { type: "death", tick: 10, cellId: 1, x: 140, y: 0, team: 0 }, // early
      { type: "death", tick: 290, cellId: 2, x: 140, y: 0, team: 0 }, // late, same team & x
    ];
    const deaths = eventNotes(log(c, events, 300, 300, 0), key, voices, FPS).filter((n) => n.env === "pluck");
    expect(deaths[1]!.freq).toBeGreaterThan(deaths[0]!.freq);
  });
});

describe("eventNotes — other events", () => {
  test("explosion makes a low boom below the root with a downward pitch drop", () => {
    const c = cfg(["Bomb", "Tank"]);
    const key = makeKey(c.seed);
    const voices = makeVoices(c.seed, c.powers);
    const events: SimEvent[] = [{ type: "explosion", tick: 60, x: 140, y: 0, team: 0 }];
    const notes = eventNotes(log(c, events, 300, 300, 0), key, voices, FPS);
    const boom = notes.find((n) => n.freq < key.rootFreq);
    expect(boom).toBeDefined();
    expect(boom!.freqEnd!).toBeLessThan(boom!.freq); // pitch drops
  });

  test("projectileFire makes a short high descending blip", () => {
    const c = cfg(["Sniper", "Tank"]);
    const key = makeKey(c.seed);
    const voices = makeVoices(c.seed, c.powers);
    const events: SimEvent[] = [{ type: "projectileFire", tick: 60, team: 0 }];
    const notes = eventNotes(log(c, events, 300, 300, 0), key, voices, FPS);
    const blip = notes.find((n) => n.env === "blip");
    expect(blip).toBeDefined();
    expect(blip!.dur).toBeLessThan(0.2);
    expect(blip!.freqEnd!).toBeLessThan(blip!.freq); // downward sweep
  });

  test("leadChange makes a rising two-note bell motif", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    const voices = makeVoices(c.seed, c.powers);
    const events: SimEvent[] = [{ type: "leadChange", tick: 60, team: 1 }];
    const bells = eventNotes(log(c, events, 300, 300, 0), key, voices, FPS).filter((n) => n.timbre === "bell");
    expect(bells.length).toBeGreaterThanOrEqual(2);
    expect(bells[1]!.freq).toBeGreaterThan(bells[0]!.freq); // rises
    expect(bells[1]!.t).toBeGreaterThan(bells[0]!.t); // and is staggered later
  });

  test("battleEnd makes a multi-note winner arpeggio at/after the end", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    const voices = makeVoices(c.seed, c.powers);
    const endTick = 300;
    const events: SimEvent[] = [{ type: "battleEnd", tick: endTick, winner: 1 }];
    const notes = eventNotes(log(c, events, endTick, 348, 1), key, voices, FPS);
    // an arpeggio: several bell notes, each starting at or after the end tick
    const arp = notes.filter((n) => n.timbre === "bell" && n.t >= endTick / FPS - 1e-9);
    expect(arp.length).toBeGreaterThanOrEqual(3);
    // ascending arpeggio
    const freqs = arp.map((n) => n.freq);
    expect(freqs[freqs.length - 1]!).toBeGreaterThan(freqs[0]!);
    // and a sustained pad underneath
    expect(notes.some((n) => n.env === "pad")).toBe(true);
  });

  test("a stalemate (winner < 0) produces no winner arpeggio", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    const voices = makeVoices(c.seed, c.powers);
    const events: SimEvent[] = [{ type: "battleEnd", tick: 300, winner: -1 }];
    const notes = eventNotes(log(c, events, 300, 348, -1), key, voices, FPS);
    expect(notes).toHaveLength(0);
  });
});

describe("bedNotes — continuous musical bed", () => {
  test("spans the whole video", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    const duration = 6;
    const notes = bedNotes(log(c, [], 300, 360, 0), key, duration);
    expect(notes.length).toBeGreaterThan(0);
    const times = notes.map((n) => n.t);
    expect(Math.min(...times)).toBeLessThan(0.5); // starts near t=0
    expect(Math.max(...times)).toBeGreaterThan(duration - 1); // continues to the end
    for (const n of notes) expect(n.t).toBeLessThanOrEqual(duration);
  });

  test("intensity swells where the action is densest", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    const duration = 10;
    // deaths clustered in the final third -> the bed should be louder there than at the start.
    const events: SimEvent[] = [];
    for (let i = 0; i < 40; i++) {
      events.push({ type: "death", tick: 480 + i * 3, cellId: i, x: 140, y: 0, team: 0 });
    }
    const notes = bedNotes(log(c, events, 600, 600, 0), key, duration);
    const early = notes.filter((n) => n.t < 2);
    const late = notes.filter((n) => n.t > 8);
    const avg = (ns: typeof notes) => ns.reduce((s, n) => s + n.gain, 0) / Math.max(1, ns.length);
    expect(avg(late)).toBeGreaterThan(avg(early));
  });

  test("is deterministic", () => {
    const c = cfg(["Tank", "Berserker"]);
    const key = makeKey(c.seed);
    expect(bedNotes(log(c, [], 300, 360, 0), key, 6)).toEqual(bedNotes(log(c, [], 300, 360, 0), key, 6));
  });
});
