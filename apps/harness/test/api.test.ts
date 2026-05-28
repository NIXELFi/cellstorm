import { describe, it, expect } from "vitest";
import { resultsUrl, configUrl, logUrl, progressUrl, stopUrl } from "../src/api";

describe("api url builders", () => {
  it("builds results url with n and optional batch", () => {
    expect(resultsUrl(5)).toBe("/api/results?n=5");
    expect(resultsUrl(10, "smoke")).toBe("/api/results?n=10&batch=smoke");
  });
  it("encodes config/log ids (configId contains commas + colons)", () => {
    const id = "3:Tank,Plague,Sniper:42";
    expect(configUrl(id)).toBe(`/api/config/${encodeURIComponent(id)}`);
    expect(logUrl(id)).toBe(`/api/log/${encodeURIComponent(id)}`);
    expect(configUrl(id)).toContain("%3A");
    expect(configUrl(id)).toContain("%2C");
  });
  it("builds sweep control urls", () => {
    expect(progressUrl("b1")).toBe("/api/sweep/b1/progress");
    expect(stopUrl("b1")).toBe("/api/sweep/b1/stop");
  });
});
