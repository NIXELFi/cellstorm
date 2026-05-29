import { describe, it, expect } from "vitest";
import { audioOffsetSec, audioShouldPlay, musicCue } from "../src/ui/previewAudioLogic";

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

describe("musicCue", () => {
  it("returns null when music is disabled", () => {
    expect(musicCue(0, 60, { enabled: false, startOffsetSec: 0, startInTrackSec: 0 })).toBeNull();
  });

  it("schedules a delay when playback is before the start offset", () => {
    // frame 60 = 1s in; music starts at 3s -> 2s delay, from the track's start point (5s)
    const cue = musicCue(60, 60, { enabled: true, startOffsetSec: 3, startInTrackSec: 5 });
    expect(cue).toEqual({ delaySec: 2, trackOffsetSec: 5 });
  });

  it("starts immediately from the matching track point when past the offset", () => {
    // frame 600 = 10s in; offset 3s -> 7s elapsed; track start 5s -> begin at 12s, no delay
    const cue = musicCue(600, 60, { enabled: true, startOffsetSec: 3, startInTrackSec: 5 });
    expect(cue).toEqual({ delaySec: 0, trackOffsetSec: 12 });
  });
});
