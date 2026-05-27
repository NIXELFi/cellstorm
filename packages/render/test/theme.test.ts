import { describe, it, expect } from "vitest";
import { THEME, teamColor, teamName } from "../src/theme";

describe("THEME", () => {
  it("has at least 6 team colors", () => {
    expect(THEME.teams.length).toBeGreaterThanOrEqual(6);
  });
  it("has unique team colors", () => {
    expect(new Set(THEME.teams.map((t) => t.color)).size).toBe(THEME.teams.length);
  });
  it("baseline background matches the prototype canvas frame (#050008)", () => {
    expect(THEME.background).toBe(0x050008);
  });
  it("page background matches the prototype body (#08070d)", () => {
    expect(THEME.pageBackground).toBe(0x08070d);
  });
  it("ports the prototype team palette (Red/Blue/Gold/Green/Purple/Cyan)", () => {
    expect(THEME.teams[0]).toEqual({ name: "Red", color: 0xff5066 });
    expect(THEME.teams[1]).toEqual({ name: "Blue", color: 0x5099ff });
    expect(THEME.teams[5]).toEqual({ name: "Cyan", color: 0x22d3ee });
  });
});

describe("teamColor / teamName", () => {
  it("returns the palette entry for a team index", () => {
    expect(teamColor(THEME, 0)).toBe(0xff5066);
    expect(teamName(THEME, 1)).toBe("Blue");
  });
  it("wraps when team index exceeds the palette", () => {
    expect(teamColor(THEME, THEME.teams.length)).toBe(THEME.teams[0]!.color);
  });
});
