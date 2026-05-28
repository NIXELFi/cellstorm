import { describe, it, expect } from "vitest";
import { audioOffsetSec, audioShouldPlay } from "../src/ui/previewAudioLogic";

describe("audioOffsetSec", () => {
  it("converts the current frame to seconds at 60fps", () => {
    expect(audioOffsetSec(0, 60)).toBe(0);
    expect(audioOffsetSec(90, 60)).toBeCloseTo(1.5, 6);
  });
});

describe("audioShouldPlay", () => {
  it("plays only when enabled, playing, at 1x, and not ended", () => {
    expect(audioShouldPlay({ enabled: true, playing: true, speed: 1, ended: false })).toBe(true);
  });
  it("is silent when the sound toggle is off", () => {
    expect(audioShouldPlay({ enabled: false, playing: true, speed: 1, ended: false })).toBe(false);
  });
  it("is silent while paused", () => {
    expect(audioShouldPlay({ enabled: true, playing: false, speed: 1, ended: false })).toBe(false);
  });
  it("is silent at non-1x speeds (sync only holds at 1x)", () => {
    expect(audioShouldPlay({ enabled: true, playing: true, speed: 2, ended: false })).toBe(false);
    expect(audioShouldPlay({ enabled: true, playing: true, speed: 0.5, ended: false })).toBe(false);
  });
  it("is silent once the battle has ended", () => {
    expect(audioShouldPlay({ enabled: true, playing: true, speed: 1, ended: true })).toBe(false);
  });
});
