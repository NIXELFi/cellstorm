import { describe, it, expect } from "vitest";
import { configIdOf, configId } from "../src/store";

describe("configIdOf", () => {
  it("formats as `${teamCount}:${powers.join(',')}:${seed}`", () => {
    expect(configIdOf({ teamCount: 4, powers: ["Tank", "Plague", "Swift", "Brute"], seed: 7 })).toBe(
      "4:Tank,Plague,Swift,Brute:7",
    );
  });

  it("is stable and order-sensitive on powers", () => {
    const a = configIdOf({ teamCount: 2, powers: ["Tank", "Plague"], seed: 1 });
    const b = configIdOf({ teamCount: 2, powers: ["Plague", "Tank"], seed: 1 });
    expect(a).toBe("2:Tank,Plague:1");
    expect(a).not.toBe(b);
  });

  it("handles a single power and seed 0", () => {
    expect(configIdOf({ teamCount: 1, powers: ["Goliath"], seed: 0 })).toBe("1:Goliath:0");
  });

  it("configId is an alias for configIdOf", () => {
    expect(configId).toBe(configIdOf);
  });
});
