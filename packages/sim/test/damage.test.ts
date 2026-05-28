import { describe, it, expect } from "vitest";
import { createWorld } from "../src/world";
import { applyDamage } from "../src/systems/damage";
import { EventSink } from "../src/events";
import { normalizeConfig } from "../src/config";

describe("applyDamage", () => {
  it("kills target at 0 hp and emits death+kill", () => {
    const cfg = normalizeConfig({ seed: 1, teamCount: 2, powers: ["Berserker", "Glasshammer"] });
    const w = createWorld(cfg);
    const sink = new EventSink();
    const atk = w.cells.find((c) => c.team === 0)!;
    const tgt = w.cells.find((c) => c.team === 1)!;
    tgt.hp = 1;
    applyDamage(w, sink, atk, tgt, 100);
    expect(tgt.alive).toBe(false);
    expect(sink.events.some((e) => e.type === "death")).toBe(true);
    expect(sink.events.some((e) => e.type === "kill")).toBe(true);
  });
});
