import { describe, it, expect } from "vitest";
import { runBattle } from "../src/battle";
import { normalizeConfig } from "../src/config";
const cfg = normalizeConfig({ seed: 999, teamCount: 4, powers: ["Tank", "Plague", "Sniper", "Swift"] });
describe("runBattle determinism", () => {
    it("produces identical event logs across two runs", () => {
        const a = runBattle(cfg);
        const b = runBattle(cfg);
        expect(a.log.events).toEqual(b.log.events);
        expect(a.summary).toEqual(b.summary);
    });
    it("produces a per-tick team-count timeline", () => {
        const { log } = runBattle(cfg);
        expect(log.timeline.length).toBeGreaterThan(0);
        expect(log.timeline[0].counts.length).toBe(cfg.teamCount);
    });
});
