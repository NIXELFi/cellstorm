import { describe, it, expect } from "vitest";
import { ffmpegArgs } from "../src/encode";

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
});
