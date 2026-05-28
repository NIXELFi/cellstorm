import { describe, it, expect } from "vitest";
import { parseRenderArgs, resolveConfig, resolveHud, resolveWidth } from "../src/cli";
import { DEFAULT_HUD } from "@cellstorm/render/hud-config";
import { MASTER_WIDTH } from "../src/renderBattle";

describe("parseRenderArgs", () => {
  it("parses all flags", () => {
    const a = parseRenderArgs([
      "--config", "2:Tank,Plague:7",
      "--db", "/x/db.sqlite",
      "--out", "out.mp4",
      "--scale", "0.25",
      "--maxframes", "120",
      "--keep",
    ]);
    expect(a.config).toBe("2:Tank,Plague:7");
    expect(a.db).toBe("/x/db.sqlite");
    expect(a.out).toBe("out.mp4");
    expect(a.scale).toBe("0.25");
    expect(a.maxframes).toBe("120");
    expect(a.keep).toBe(true);
  });

  it("leaves optional flags undefined", () => {
    const a = parseRenderArgs(["--config", "{}", "--out", "o.mp4"]);
    expect(a.db).toBeUndefined();
    expect(a.scale).toBeUndefined();
    expect(a.keep).toBeUndefined();
  });

  it("parses --ss and --crf", () => {
    const a = parseRenderArgs(["--config", "{}", "--out", "o.mp4", "--ss", "1.5", "--crf", "16"]);
    expect(a.ss).toBe("1.5");
    expect(a.crf).toBe("16");
  });
});

describe("resolveConfig", () => {
  it("parses + normalizes inline JSON config", () => {
    const cfg = resolveConfig('{"seed":7,"teamCount":2,"powers":["Glasshammer","Swift"]}', undefined);
    expect(cfg.seed).toBe(7);
    expect(cfg.teamCount).toBe(2);
    expect(cfg.powers).toEqual(["Glasshammer", "Swift"]);
    // normalizeConfig fills defaults.
    expect(cfg.maxTicks).toBeGreaterThan(0);
    expect(cfg.arena.width).toBeGreaterThan(0);
  });

  it("requires --db when config is an id", () => {
    expect(() => resolveConfig("2:Tank,Plague:7", undefined)).toThrow(/db/i);
  });
});

describe("resolveHud", () => {
  it("defaults to DEFAULT_HUD", () => {
    expect(resolveHud(undefined)).toEqual(DEFAULT_HUD);
  });
  it("merges overrides onto the default", () => {
    const hud = resolveHud('{"showIntro":false,"introTitle":"X vs Y"}');
    expect(hud.showIntro).toBe(false);
    expect(hud.introTitle).toBe("X vs Y");
    expect(hud.showCounters).toBe(DEFAULT_HUD.showCounters);
  });
});

describe("resolveWidth", () => {
  it("defaults to the 2160px master", () => {
    expect(resolveWidth(undefined)).toBe(MASTER_WIDTH);
  });
  it("scales the master width", () => {
    expect(resolveWidth("0.25")).toBe(540);
  });
  it("rejects non-positive scale", () => {
    expect(() => resolveWidth("0")).toThrow();
    expect(() => resolveWidth("-1")).toThrow();
  });
});
