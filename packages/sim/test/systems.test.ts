import { describe, it, expect } from "vitest";
import { createWorld, rebuildGrid } from "../src/world";
import { EventSink } from "../src/events";
import { collisionSystem } from "../src/systems/collision";
import { normalizeConfig } from "../src/config";

describe("collisionSystem", () => {
  it("cross-team overlap deals damage", () => {
    const cfg = normalizeConfig({ seed: 1, teamCount: 2, powers: ["Brute", "Tank"] });
    const w = createWorld(cfg);
    const a = w.cells.find((c) => c.team === 0)!;
    const b = w.cells.find((c) => c.team === 1)!;
    a.x = 50; a.y = 50; b.x = 51; b.y = 50; // overlapping
    const hpBefore = b.hp;
    rebuildGrid(w);
    collisionSystem(w, new EventSink());
    expect(b.hp).toBeLessThan(hpBefore);
  });
});
