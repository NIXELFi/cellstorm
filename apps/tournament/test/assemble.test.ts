import { describe, it, expect } from "vitest";
import { concatListContent } from "../src/assemble";

describe("concatListContent", () => {
  it("formats a concat-demuxer list, one file per line", () => {
    expect(concatListContent(["/a/000.mp4", "/a/001.mp4"])).toBe("file '/a/000.mp4'\nfile '/a/001.mp4'\n");
  });

  it("escapes single quotes in paths", () => {
    expect(concatListContent(["/b/it's.mp4"])).toBe("file '/b/it'\\''s.mp4'\n");
  });
});
