import { describe, it, expect } from "vitest";
import { pairingsFor, nextRoundEntrants } from "../src/bracket";

describe("bracket", () => {
  it("pairs adjacent slots", () => {
    expect(pairingsFor(16)).toEqual([[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 13], [14, 15]]);
    expect(pairingsFor(2)).toEqual([[0, 1]]);
  });

  it("advances winners into the next round in order", () => {
    expect(nextRoundEntrants(["A", "B", "C", "D"])).toEqual([["A", "B"], ["C", "D"]]);
    expect(nextRoundEntrants(["A", "B"])).toEqual([["A", "B"]]);
  });
});
