import { describe, it, expect } from "vitest";
import {
  easeCounter,
  leaderboardOrder,
  leaderTeam,
  introVisible,
  introAlpha,
  winnerAlpha,
  defaultIntroTitle,
} from "../src/hud/logic";

describe("easeCounter", () => {
  it("moves toward target without overshooting", () => {
    const v = easeCounter(0, 100);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(100);
  });
  it("snaps to target when close", () => {
    expect(easeCounter(99.8, 100)).toBe(100);
    expect(easeCounter(100, 100)).toBe(100);
  });
  it("converges to target over many frames", () => {
    let v = 0;
    for (let i = 0; i < 50; i++) v = easeCounter(v, 42);
    expect(v).toBe(42);
  });
});

describe("leaderboardOrder", () => {
  it("sorts descending by count", () => {
    const ranked = leaderboardOrder([5, 20, 10]);
    expect(ranked.map((r) => r.team)).toEqual([1, 2, 0]);
  });
  it("breaks ties by ascending team id (stable)", () => {
    const ranked = leaderboardOrder([7, 7, 7]);
    expect(ranked.map((r) => r.team)).toEqual([0, 1, 2]);
  });
});

describe("leaderTeam", () => {
  it("returns the argmax team", () => {
    expect(leaderTeam([3, 9, 5])).toBe(1);
  });
  it("returns -1 when all teams are extinct", () => {
    expect(leaderTeam([0, 0])).toBe(-1);
  });
  it("breaks ties toward the lowest team id", () => {
    expect(leaderTeam([4, 4])).toBe(0);
  });
});

describe("intro timing", () => {
  it("is visible before the intro window ends and hidden after", () => {
    expect(introVisible(0, 1.5)).toBe(true);
    expect(introVisible(89, 1.5)).toBe(true); // 1.5s*60 = 90 ticks
    expect(introVisible(90, 1.5)).toBe(false);
  });
  it("is fully opaque early then fades to 0 by the end", () => {
    expect(introAlpha(0, 1.5)).toBe(1);
    expect(introAlpha(45, 1.5)).toBe(1); // before fade start (0.75*90=67.5)
    expect(introAlpha(90, 1.5)).toBe(0);
    const mid = introAlpha(80, 1.5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe("winnerAlpha", () => {
  it("is 0 while unresolved", () => {
    expect(winnerAlpha(-1, 100)).toBe(0);
  });
  it("fades in over the reveal window and clamps at 1", () => {
    expect(winnerAlpha(2, 0)).toBe(0);
    expect(winnerAlpha(2, 12)).toBe(0.5); // 0.4s*60 = 24 ticks
    expect(winnerAlpha(2, 24)).toBe(1);
    expect(winnerAlpha(2, 1000)).toBe(1);
  });
});

describe("defaultIntroTitle", () => {
  it("formats a 1v1 matchup", () => {
    expect(defaultIntroTitle(["Plague", "Tank"])).toBe("Plague vs Tank — who wins?");
  });
  it("joins multi-team matchups", () => {
    expect(defaultIntroTitle(["A", "B", "C"])).toBe("A · B · C — who survives?");
  });
});
