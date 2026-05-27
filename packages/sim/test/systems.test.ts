import { describe, it, expect } from "vitest";
import { createWorld, rebuildGrid } from "../src/world";
import { EventSink } from "../src/events";
import { collisionSystem } from "../src/systems/collision";
import { abilitiesSystem } from "../src/systems/abilities";
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

describe("magnet pull", () => {
  it("pulls an enemy near the edge of pullR (beyond the old 2-cell window)", () => {
    // Magnet has pullR = 60; old window was -2..2 grid cells (~28 units).
    // Place the enemy ~50 units away: inside 60 range, outside the old window.
    const cfg = normalizeConfig({ seed: 2, teamCount: 2, powers: ["Magnet", "Tank"] });
    const w = createWorld(cfg);
    // Keep exactly one cell per team to make the assertion clean.
    const magnet = w.cells.find((c) => c.team === 0)!;
    const enemy = w.cells.find((c) => c.team === 1)!;
    for (const c of w.cells) if (c !== magnet && c !== enemy) c.alive = false;
    magnet.x = 140; magnet.y = 140;
    enemy.x = 190; enemy.y = 140; // 50 units away
    enemy.vx = 0; enemy.vy = 0;
    rebuildGrid(w);
    abilitiesSystem(w, new EventSink());
    // Pull is toward the magnet => negative x velocity gained.
    expect(enemy.vx).toBeLessThan(0);
  });
});
