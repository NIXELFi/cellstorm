import { describe, it, expect } from "vitest";
import {
  initialRenderProgress,
  applyRenderStdout,
  renderView,
  formatDuration,
} from "../src/renderProgress";

describe("applyRenderStdout", () => {
  it("captures the total frame count", () => {
    const p0 = initialRenderProgress("/out.mp4", 1000);
    const p1 = applyRenderStdout(p0, "Total frames: 1500\n", 1000);
    expect(p1.total).toBe(1500);
    expect(p1.state).toBe("rendering");
  });

  it("tracks the latest captured-frame count (last line in a chunk wins)", () => {
    let p = initialRenderProgress("/out.mp4", 0);
    p = applyRenderStdout(p, "Total frames: 1500\n", 0);
    p = applyRenderStdout(p, "  15 frames captured...\n  30 frames captured...\n", 100);
    expect(p.frames).toBe(30);
  });

  it("transitions to encoding, snapping frames to total and stamping encodeStartedAt", () => {
    let p = initialRenderProgress("/out.mp4", 0);
    p = applyRenderStdout(p, "Total frames: 1500\n", 0);
    p = applyRenderStdout(p, "  1490 frames captured...\n", 500);
    p = applyRenderStdout(p, "Captured 1500 frames (1080x1920, ended=true). Encoding...\n", 900);
    expect(p.state).toBe("encoding");
    expect(p.frames).toBe(1500);
    expect(p.encodeStartedAt).toBe(900);
  });

  it("is pure (does not mutate the previous state)", () => {
    const p0 = initialRenderProgress("/out.mp4", 0);
    const p1 = applyRenderStdout(p0, "Total frames: 10\n", 0);
    expect(p0.total).toBe(0);
    expect(p1).not.toBe(p0);
  });
});

describe("renderView", () => {
  it("shows percent and an ETA while rendering", () => {
    const p = { ...initialRenderProgress("/out.mp4", 0), total: 100, frames: 25 };
    const v = renderView(p, 10_000); // 10s elapsed, 25 frames -> 2.5 fps -> 75 left -> ~30s
    expect(v.fraction).toBeCloseTo(0.25, 5);
    expect(v.indeterminate).toBe(false);
    expect(v.terminal).toBe(false);
    expect(v.label).toContain("25/100");
    expect(v.label).toContain("25%");
    expect(v.label).toContain("30s left");
  });

  it("is indeterminate while preparing (total unknown)", () => {
    const v = renderView(initialRenderProgress("/out.mp4", 0), 500);
    expect(v.indeterminate).toBe(true);
    expect(v.fraction).toBe(0);
    expect(v.label).toMatch(/Preparing/);
  });

  it("is indeterminate + full while encoding", () => {
    const p = { ...initialRenderProgress("/out.mp4", 0), state: "encoding" as const, total: 100, frames: 100, encodeStartedAt: 1000 };
    const v = renderView(p, 4000);
    expect(v.fraction).toBe(1);
    expect(v.indeterminate).toBe(true);
    expect(v.label).toContain("Encoding");
    expect(v.label).toContain("3s");
  });

  it("reports done and error as terminal", () => {
    const base = initialRenderProgress("/out.mp4", 0);
    const done = renderView({ ...base, state: "done" }, 12_000);
    expect(done.terminal).toBe(true);
    expect(done.fraction).toBe(1);
    expect(done.label).toContain("Done in 12s");

    const err = renderView({ ...base, state: "error", error: "ffmpeg blew up" }, 0);
    expect(err.terminal).toBe(true);
    expect(err.label).toContain("ffmpeg blew up");
  });
});

describe("formatDuration", () => {
  it("formats seconds and minutes", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(-5)).toBe("0s");
  });
});
