import { describe, it, expect } from "vitest";
import { ffmpegArgs, type MusicMux } from "../src/encode";
import { DEFAULT_MUSIC } from "@cellstorm/audio";

describe("ffmpegArgs", () => {
  it("builds a 60fps libx264 yuv420p command from a PNG sequence", () => {
    const args = ffmpegArgs("/tmp/frames", 60, "/out/battle.mp4");
    expect(args).toEqual([
      "-y",
      "-framerate",
      "60",
      "-i",
      "/tmp/frames/%06d.png",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "/out/battle.mp4",
    ]);
  });

  it("honors a custom fps", () => {
    const args = ffmpegArgs("frames", 30, "o.mp4");
    expect(args[args.indexOf("-framerate") + 1]).toBe("30");
  });

  it("references the input pattern relative to the frames dir", () => {
    const args = ffmpegArgs("/x/y", 60, "z.mp4");
    expect(args).toContain("/x/y/%06d.png");
  });

  it("omits any audio input when no audio path is given", () => {
    const args = ffmpegArgs("/tmp/frames", 60, "out.mp4");
    expect(args).not.toContain("-c:a");
    expect(args.filter((a) => a === "-i")).toHaveLength(1); // only the frame sequence
  });

  it("adds the audio track as a second input with aac + -shortest when given", () => {
    const args = ffmpegArgs("/tmp/frames", 60, "out.mp4", "/tmp/frames/audio.wav");
    // both inputs present, audio after video
    const inputs = args.reduce<string[]>((acc, a, i) => (a === "-i" ? [...acc, args[i + 1]!] : acc), []);
    expect(inputs).toEqual(["/tmp/frames/%06d.png", "/tmp/frames/audio.wav"]);
    expect(args).toContain("-c:a");
    expect(args[args.indexOf("-c:a") + 1]).toBe("aac");
    expect(args).toContain("-shortest");
    // video codec still libx264
    expect(args).toContain("libx264");
    // output path is last
    expect(args[args.length - 1]).toBe("out.mp4");
  });

  it("delays the audio with -itsoffset (before the audio input) when an offset is given", () => {
    const args = ffmpegArgs("/tmp/frames", 60, "out.mp4", "/tmp/frames/audio.wav", 0.32);
    const off = args.indexOf("-itsoffset");
    expect(off).toBeGreaterThan(-1);
    expect(args[off + 1]).toBe("0.32");
    // -itsoffset must come immediately before the audio -i (it applies to the next input).
    expect(args[off + 2]).toBe("-i");
    expect(args[off + 3]).toBe("/tmp/frames/audio.wav");
  });

  it("omits -itsoffset when the offset is zero", () => {
    const args = ffmpegArgs("/tmp/frames", 60, "out.mp4", "/tmp/frames/audio.wav", 0);
    expect(args).not.toContain("-itsoffset");
  });

  it("adds a Lanczos downscale filter when scale dims are given (supersample)", () => {
    const args = ffmpegArgs("/tmp/frames", 60, "out.mp4", undefined, 0, { scaleW: 2160, scaleH: 3840 });
    const vf = args.indexOf("-vf");
    expect(vf).toBeGreaterThan(-1);
    expect(args[vf + 1]).toBe("scale=2160:3840:flags=lanczos");
  });

  it("adds CRF + preset + high profile when quality opts are given", () => {
    const args = ffmpegArgs("/tmp/frames", 60, "out.mp4", undefined, 0, { crf: 18 });
    expect(args[args.indexOf("-crf") + 1]).toBe("18");
    expect(args).toContain("-preset");
    expect(args[args.indexOf("-profile:v") + 1]).toBe("high");
    expect(args).toContain("yuv420p");
  });

  it("leaves the bare command unchanged when no video opts are given (back-compat)", () => {
    const args = ffmpegArgs("/tmp/frames", 60, "out.mp4");
    expect(args).not.toContain("-vf");
    expect(args).not.toContain("-crf");
    expect(args).not.toContain("-profile:v");
  });
});

describe("ffmpegArgs with custom music", () => {
  const music = (over: Partial<MusicMux["settings"]> = {}, vid = 30): MusicMux => ({
    path: "/tmp/music.mp3",
    settings: { ...DEFAULT_MUSIC, enabled: true, volume: 0.5, startOffsetSec: 2, startInTrackSec: 10, fadeInSec: 1, fadeOutSec: 2, ...over },
    videoDurationSec: vid,
  });

  it("seeks into the track with -ss immediately before the music input", () => {
    const args = ffmpegArgs("/f", 60, "o.mp4", "/f/audio.wav", 0, undefined, music());
    const ss = args.indexOf("-ss");
    expect(ss).toBeGreaterThan(-1);
    expect(args[ss + 1]).toBe("10");
    expect(args[ss + 2]).toBe("-i");
    expect(args[ss + 3]).toBe("/tmp/music.mp3");
  });

  it("mixes music UNDER the synth (normalize=0) at the chosen volume", () => {
    const fc = ffmpegArgs("/f", 60, "o.mp4", "/f/audio.wav", 0, undefined, music()).join(" ");
    expect(fc).toContain("volume=0.5");
    expect(fc).toContain("amix=inputs=2:normalize=0");
  });

  it("fades the music in/out and delays it to the start offset", () => {
    const fc = ffmpegArgs("/f", 60, "o.mp4", "/f/audio.wav", 0, undefined, music()).join(" ");
    expect(fc).toContain("afade=t=in:st=0:d=1");
    expect(fc).toContain("afade=t=out:st=26:d=2"); // plays 30-2=28s, fade-out at 28-2=26
    expect(fc).toContain("adelay=2000:all=1"); // 2s offset -> 2000ms
  });

  it("maps the mixed audio and keeps aac + -shortest, output last", () => {
    const args = ffmpegArgs("/f", 60, "o.mp4", "/f/audio.wav", 0, undefined, music());
    expect(args).toContain("-filter_complex");
    expect(args).toContain("-map");
    expect(args[args.indexOf("-c:a") + 1]).toBe("aac");
    expect(args).toContain("-shortest");
    expect(args[args.length - 1]).toBe("o.mp4");
  });

  it("uses music as the sole audio when the synth track is muted (no audioPath)", () => {
    const fc = ffmpegArgs("/f", 60, "o.mp4", undefined, 0, undefined, music()).join(" ");
    expect(fc).not.toContain("amix");
    expect(fc).toContain("volume=0.5");
  });

  it("scales video via filter_complex (not -vf) when downscaling with music", () => {
    const args = ffmpegArgs("/f", 60, "o.mp4", "/f/audio.wav", 0, { scaleW: 1080, scaleH: 1920 }, music());
    expect(args).not.toContain("-vf");
    expect(args.join(" ")).toContain("scale=1080:1920:flags=lanczos");
    expect(args.join(" ")).toContain("[vout]");
  });

  it("is a no-op when music is disabled (bare command preserved)", () => {
    const args = ffmpegArgs("/f", 60, "o.mp4", "/f/audio.wav", 0, undefined, music({ enabled: false }));
    expect(args).not.toContain("-filter_complex");
  });
});
