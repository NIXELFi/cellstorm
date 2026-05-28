import { describe, it, expect } from "vitest";
import { revealCommands } from "../src/revealCommands";

describe("revealCommands", () => {
  it("uses Finder reveal + open on macOS", () => {
    const cmds = revealCommands("darwin", "/Users/me/out/battle.mp4");
    expect(cmds).toEqual([
      { cmd: "open", args: ["-R", "/Users/me/out/battle.mp4"] },
      { cmd: "open", args: ["/Users/me/out/battle.mp4"] },
    ]);
  });

  it("uses Explorer /select + start on Windows", () => {
    const file = "C:\\Users\\me\\out\\battle.mp4";
    const cmds = revealCommands("win32", file);
    expect(cmds[0]).toEqual({ cmd: "explorer", args: [`/select,${file}`] });
    // open in default app via the cmd `start` builtin; "" is the required title arg.
    expect(cmds[1]).toEqual({ cmd: "cmd", args: ["/c", "start", "", file] });
  });

  it("falls back to xdg-open on Linux/other", () => {
    const cmds = revealCommands("linux", "/home/me/out/battle.mp4");
    expect(cmds).toEqual([{ cmd: "xdg-open", args: ["/home/me/out/battle.mp4"] }]);
  });
});
