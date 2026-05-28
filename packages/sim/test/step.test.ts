import { describe, it, expect } from "vitest";
import { createWorld, teamCounts } from "../src/world";
import { step } from "../src/step";
import { EventSink } from "../src/events";
import { normalizeConfig } from "../src/config";

describe("step", () => {
  it("eventually resolves to a winner or stalemate within maxTicks", () => {
    const cfg = normalizeConfig({ seed: 7, teamCount: 2, powers: ["Glasshammer", "Swift"] });
    const w = createWorld(cfg);
    const sink = new EventSink();
    let ended = false;
    for (let i = 0; i < cfg.maxTicks && !ended; i++) ended = step(w, sink);
    expect(ended).toBe(true);
    expect(w.winner).toBeGreaterThanOrEqual(-1);
  });

  it("emits leadChange events and tracks the max-count team as leader", () => {
    const cfg = normalizeConfig({ seed: 7, teamCount: 4, powers: ["Glasshammer", "Swift", "Tank", "Sniper"] });
    const w = createWorld(cfg);
    const sink = new EventSink();
    let ended = false;
    for (let i = 0; i < cfg.maxTicks && !ended; i++) ended = step(w, sink);
    const leadChanges = sink.events.filter((e) => e.type === "leadChange");
    // A lopsided 4-way fight should swing the lead at least once.
    expect(leadChanges.length).toBeGreaterThan(0);
    // Final leader should match the team with the max alive count (or be valid).
    const counts = teamCounts(w);
    const max = Math.max(...counts);
    if (max > 0) expect(counts[w.leader]).toBe(max);
  });

  it("stalemate cutoff triggers without deaths for two never-dying teams", () => {
    // Two single-cell teams far apart that never engage => no deaths.
    const cfg = normalizeConfig({ seed: 1, teamCount: 2, powers: ["Tank", "Tank"], totalCells: 2 });
    const w = createWorld(cfg);
    const sink = new EventSink();
    let ended = false;
    let ticks = 0;
    for (let i = 0; i < cfg.maxTicks && !ended; i++) { ended = step(w, sink); ticks++; }
    expect(ended).toBe(true);
    // Stalemate (12s) should fire well before the 75s maxTicks hard cap.
    expect(ticks).toBeLessThan(cfg.maxTicks);
    expect(w.winner).toBe(-1);
  });
});
