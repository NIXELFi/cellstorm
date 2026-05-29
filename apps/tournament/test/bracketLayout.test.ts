import { describe, it, expect } from "vitest";
import { competitorRect, championRect } from "../src/scene/bracketLayout";

// Full-frame region (16:9 4K landscape).
const R = { x: 0, y: 0, w: 3840, h: 2160 };

describe("bracketLayout", () => {
  it("stacks ro16 competitors top-to-bottom without overlap", () => {
    const rects = Array.from({ length: 8 }, (_, m) => [
      competitorRect("ro16", m, 0, R),
      competitorRect("ro16", m, 1, R),
    ]).flat();
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i]!.y).toBeGreaterThan(rects[i - 1]!.y);
      expect(rects[i]!.y).toBeGreaterThanOrEqual(rects[i - 1]!.y + rects[i - 1]!.h);
    }
  });

  it("places later rounds in columns further right", () => {
    expect(competitorRect("qf", 0, 0, R).x).toBeGreaterThan(competitorRect("ro16", 0, 0, R).x);
    expect(competitorRect("sf", 0, 0, R).x).toBeGreaterThan(competitorRect("qf", 0, 0, R).x);
    expect(championRect(R).x).toBeGreaterThan(competitorRect("final", 0, 0, R).x);
  });

  it("keeps boxes within the region", () => {
    const r = competitorRect("ro16", 7, 1, R);
    expect(r.y + r.h).toBeLessThanOrEqual(R.h);
    expect(r.x + r.w).toBeLessThanOrEqual(R.w);
  });

  it("offsets into a sub-region (side panel)", () => {
    const panel = { x: 2800, y: 240, w: 900, h: 1700 };
    const box = competitorRect("ro16", 0, 0, panel);
    expect(box.x).toBeGreaterThanOrEqual(panel.x);
    expect(box.y).toBeGreaterThanOrEqual(panel.y);
    expect(box.x + box.w).toBeLessThanOrEqual(panel.x + panel.w);
  });
});
