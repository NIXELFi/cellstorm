import { describe, it, expect } from "vitest";
import { createWorld, rebuildGrid } from "../src/world";
import { decide } from "../src/ai";
import { normalizeConfig } from "../src/config";

describe("decide", () => {
  it("aggro power always engages when enemies near", () => {
    const cfg = normalizeConfig({ seed: 1, teamCount: 2, powers: ["Berserker", "Tank"] });
    const w = createWorld(cfg);
    rebuildGrid(w);
    const berserker = w.cells.find((c) => c.team === 0)!;
    berserker.aiPhase = w.frame % 8; // force decision this frame
    decide(w, berserker);
    expect(berserker.state).toBe("engage");
  });
});
