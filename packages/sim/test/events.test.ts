import { describe, it, expect } from "vitest";
import { EventSink } from "../src/events";

describe("EventSink", () => {
  it("collects events with tick stamps", () => {
    const s = new EventSink();
    s.tick = 5;
    s.death(1, 10, 20, 0);
    s.kill(2, 0, 1);
    expect(s.events).toHaveLength(2);
    expect(s.events[0]).toMatchObject({ type: "death", tick: 5, team: 0 });
  });
});
