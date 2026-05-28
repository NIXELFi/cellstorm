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
});
