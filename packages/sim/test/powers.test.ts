import { describe, it, expect } from "vitest";
import { POWERS, powerByName } from "../src/powers";

describe("powers", () => {
  it("has exactly 20 powers with unique names", () => {
    expect(POWERS).toHaveLength(20);
    expect(new Set(POWERS.map((p) => p.name)).size).toBe(20);
  });
  it("looks up by name", () => {
    expect(powerByName("Tank").hold).toBe(true);
    expect(powerByName("Goliath").hp).toBeGreaterThan(1);
  });
  it("throws on unknown power", () => {
    expect(() => powerByName("Nope")).toThrow();
  });
});
