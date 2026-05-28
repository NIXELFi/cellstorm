import { describe, it, expect } from "vitest";
import {
  SAFE_AREA,
  MASTER_W,
  MASTER_H,
  safeInsetPct,
  safeRect,
  actionTransform,
} from "../src/safeArea";

describe("safeRect", () => {
  it("derives the inset rectangle from the master frame", () => {
    const r = safeRect();
    expect(r.x).toBe(SAFE_AREA.left);
    expect(r.y).toBe(SAFE_AREA.top);
    expect(r.w).toBe(MASTER_W - SAFE_AREA.left - SAFE_AREA.right); // 1080-40-200 = 840
    expect(r.h).toBe(MASTER_H - SAFE_AREA.top - SAFE_AREA.bottom); // 1920-180-400 = 1340
    expect(r.cx).toBe(SAFE_AREA.left + r.w / 2); // 460
    expect(r.cy).toBe(SAFE_AREA.top + r.h / 2); // 850
  });
});

describe("safeInsetPct", () => {
  it("expresses insets as percentages of the master frame", () => {
    const p = safeInsetPct();
    expect(p.topPct).toBeCloseTo((180 / 1920) * 100, 5); // 9.375
    expect(p.bottomPct).toBeCloseTo((400 / 1920) * 100, 5); // 20.833
    expect(p.leftPct).toBeCloseTo((40 / 1080) * 100, 5); // 3.704
    expect(p.rightPct).toBeCloseTo((200 / 1080) * 100, 5); // 18.519
  });
});

describe("actionTransform", () => {
  it("is the identity at zoom 0 (full-bleed, sim-pure default)", () => {
    expect(actionTransform(1080, 1920, 0)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("at zoom 1, maps the frame center to the safe-zone center", () => {
    const t = actionTransform(1080, 1920, 1);
    // fitScale = min(840/1080, 1340/1920) = 0.69792
    expect(t.scale).toBeCloseTo(1340 / 1920, 5);
    // frame center (540,960) under (scale,x,y) must land on the safe center (460,850)
    expect(t.scale * 540 + t.x).toBeCloseTo(460, 4);
    expect(t.scale * 960 + t.y).toBeCloseTo(850, 4);
  });

  it("clamps out-of-range zoom", () => {
    expect(actionTransform(1080, 1920, -5)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(actionTransform(1080, 1920, 9)).toEqual(actionTransform(1080, 1920, 1));
  });
});
