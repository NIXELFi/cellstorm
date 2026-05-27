import { describe, it, expect } from "vitest";
import { TopNScores } from "../src/runner";

describe("TopNScores", () => {
  it("keeps everything (threshold -Inf) until full", () => {
    const t = new TopNScores(3);
    t.add(5);
    t.add(1);
    expect(t.threshold()).toBe(-Infinity);
  });

  it("threshold is the Nth-highest once full", () => {
    const t = new TopNScores(3);
    for (const s of [10, 2, 8, 4, 9, 1]) t.add(s);
    // top 3 are 10, 9, 8 -> threshold is the min of those = 8
    expect(t.threshold()).toBe(8);
  });

  it("ignores scores below the window once full", () => {
    const t = new TopNScores(2);
    t.add(100);
    t.add(50);
    expect(t.threshold()).toBe(50);
    t.add(10); // below window, no effect
    expect(t.threshold()).toBe(50);
    t.add(75); // displaces 50
    expect(t.threshold()).toBe(75);
  });

  it("n<=0 never keeps anything (threshold +Inf)", () => {
    const t = new TopNScores(0);
    t.add(5);
    expect(t.threshold()).toBe(Infinity);
  });
});
