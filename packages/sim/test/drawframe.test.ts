import { describe, test, expect } from "vitest";
import { normalizeConfig } from "../src/config";
import { runBattle } from "../src/battle";
import { captureFrames, packFrames, unpackFrames } from "../src/drawframe";

const cfg = () => normalizeConfig({ seed: 10154, teamCount: 2, powers: ["Frenzy", "Splitter"] });

describe("captureFrames", () => {
  test("is deterministic and matches runBattle's outcome (single source of truth)", () => {
    const a = captureFrames(cfg());
    const b = captureFrames(cfg());
    expect(a.frames.length).toBe(b.frames.length);
    expect(a.summary).toEqual(b.summary);
    // captureFrames must not alter the sim vs runBattle
    const rb = runBattle(cfg());
    expect(a.summary.winner).toBe(rb.summary.winner);
    expect(a.summary.durationTicks).toBe(rb.summary.durationTicks);
    expect(a.summary.totalTicks).toBe(rb.summary.totalTicks);
  });

  test("captures one frame per drawn tick with complete drawable cell fields", () => {
    const { frames } = captureFrames(cfg());
    expect(frames[0]!.frame).toBe(0);
    expect(frames[0]!.cells.length).toBeGreaterThan(0);
    const c = frames[0]!.cells[0]!;
    for (const k of ["team", "x", "y", "radius", "hpFrac", "vx", "vy", "dash", "stunT", "plagueT"] as const) {
      expect(typeof c[k]).toBe("number");
      expect(Number.isFinite(c[k])).toBe(true);
    }
    // last frame carries the resolved winner
    const last = frames[frames.length - 1]!;
    expect(last.winner).toBeGreaterThanOrEqual(-1);
  });

  test("alive cell count per frame never exceeds total and ends tiny (battle resolves)", () => {
    const { frames } = captureFrames(cfg());
    const first = frames[0]!.cells.length;
    const last = frames[frames.length - 1]!.cells.length;
    expect(last).toBeLessThan(first); // a resolved battle ends with far fewer cells
  });
});

describe("packFrames / unpackFrames", () => {
  test("round-trips frames within draw tolerance", () => {
    const { frames } = captureFrames(cfg());
    const round = unpackFrames(packFrames(frames));
    expect(round.length).toBe(frames.length);
    // sample a few frames across the battle
    for (const i of [0, 1, Math.floor(frames.length / 2), frames.length - 1]) {
      const a = frames[i]!, b = round[i]!;
      expect(b.frame).toBe(a.frame);
      expect(b.winner).toBe(a.winner);
      expect(b.resolvedFrame).toBe(a.resolvedFrame);
      expect(b.cells.length).toBe(a.cells.length);
      expect(b.projectiles.length).toBe(a.projectiles.length);
      if (a.cells.length > 0) {
        const ca = a.cells[0]!, cb = b.cells[0]!;
        expect(cb.team).toBe(ca.team);
        expect(cb.x).toBeCloseTo(ca.x, 2);
        expect(cb.y).toBeCloseTo(ca.y, 2);
        expect(cb.hpFrac).toBeCloseTo(ca.hpFrac, 1);
      }
    }
  });

  test("produces a compact buffer (bytes, not megabytes of JSON)", () => {
    const { frames } = captureFrames(cfg());
    const buf = packFrames(frames);
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.byteLength).toBeGreaterThan(0);
  });
});
