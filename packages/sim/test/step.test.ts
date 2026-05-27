import { describe, it, expect } from "vitest";
import { createWorld } from "../src/world";
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
});
