import { describe, it, expect } from "vitest";
import { createWorld } from "../src/world";
import { normalizeConfig } from "../src/config";
const cfg = normalizeConfig({ seed: 42, teamCount: 3, powers: ["Tank", "Plague", "Sniper"] });
describe("createWorld", () => {
    it("spawns totalCells split across teams", () => {
        const w = createWorld(cfg);
        expect(w.cells.length).toBe(cfg.totalCells);
        const perTeam = Math.round(cfg.totalCells / cfg.teamCount);
        for (let t = 0; t < cfg.teamCount; t++) {
            expect(w.cells.filter((c) => c.team === t).length).toBe(perTeam);
        }
    });
    it("is deterministic: same seed -> identical initial positions", () => {
        const a = createWorld(cfg), b = createWorld(cfg);
        expect(a.cells.map((c) => [c.x, c.y])).toEqual(b.cells.map((c) => [c.x, c.y]));
    });
    it("assigns unique ids and aiPhase in 0..7", () => {
        const w = createWorld(cfg);
        expect(new Set(w.cells.map((c) => c.id)).size).toBe(w.cells.length);
        for (const c of w.cells)
            expect(c.aiPhase).toBeGreaterThanOrEqual(0);
    });
});
