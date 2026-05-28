// Unit tests for the cosmetic kill-flash FX (FlashField pool + the pure flashVisual helper).
// Pure logic only — no Pixi instantiated. Deterministic: no PRNG, no wall-clock.

import { describe, test, expect } from "vitest";
import { FlashField, flashVisual, FLASH_TUNING } from "../src/fx";

describe("FlashField", () => {
  test("spawn adds a flash; explosion (big) lives longer than death", () => {
    const field = new FlashField();
    expect(field.flashes.length).toBe(0);
    field.spawn(10, 20, 1);
    expect(field.flashes.length).toBe(1);
    const death = field.flashes[0]!;
    expect(death).toMatchObject({ x: 10, y: 20, team: 1, big: false });
    expect(death.life).toBe(FLASH_TUNING.death.life);
    expect(death.maxLife).toBe(FLASH_TUNING.death.life);

    field.spawn(5, 6, 0, { big: true });
    const expl = field.flashes[1]!;
    expect(expl.big).toBe(true);
    expect(expl.maxLife).toBe(FLASH_TUNING.explosion.life);
    expect(expl.maxLife).toBeGreaterThan(death.maxLife);
  });

  test("advance decrements life and reaps at 0", () => {
    const field = new FlashField();
    field.spawn(0, 0, 0); // death flash
    const life0 = field.flashes[0]!.life;
    field.advance();
    expect(field.flashes[0]!.life).toBe(life0 - 1);

    // Run it down to empty; it must reap exactly when life hits 0 (no negative-life flashes left).
    for (let i = 0; i < FLASH_TUNING.death.life; i++) field.advance();
    expect(field.flashes.length).toBe(0);
  });

  test("clear empties the pool", () => {
    const field = new FlashField();
    field.spawn(0, 0, 0);
    field.spawn(1, 1, 1, { big: true });
    expect(field.flashes.length).toBe(2);
    field.clear();
    expect(field.flashes.length).toBe(0);
  });

  test("respects its capacity cap", () => {
    const field = new FlashField(3);
    for (let i = 0; i < 10; i++) field.spawn(i, i, 0);
    expect(field.flashes.length).toBe(3);
  });
});

describe("flashVisual", () => {
  test("radius grows and alpha fades as life decreases", () => {
    const max = FLASH_TUNING.death.life;
    const fresh = flashVisual(max, max, false);
    const mid = flashVisual(Math.floor(max / 2), max, false);
    const dead = flashVisual(0, max, false);

    // Radius grows over the flash's life.
    expect(mid.radius).toBeGreaterThan(fresh.radius);
    expect(dead.radius).toBeGreaterThan(mid.radius);
    expect(fresh.radius).toBeCloseTo(FLASH_TUNING.death.radiusStart, 6);
    expect(dead.radius).toBeCloseTo(FLASH_TUNING.death.radiusEnd, 6);

    // Alpha fades out over the flash's life.
    expect(fresh.alpha).toBeCloseTo(1, 6);
    expect(mid.alpha).toBeLessThan(fresh.alpha);
    expect(dead.alpha).toBeCloseTo(0, 6);
  });

  test("explosion (big) is larger than death at every age", () => {
    const dMax = FLASH_TUNING.death.life;
    const eMax = FLASH_TUNING.explosion.life;
    // Compare at the same normalized age (fresh and dying).
    expect(flashVisual(eMax, eMax, true).radius).toBeGreaterThan(flashVisual(dMax, dMax, false).radius);
    expect(flashVisual(0, eMax, true).radius).toBeGreaterThan(flashVisual(0, dMax, false).radius);
  });

  test("is pure/deterministic and clamps out-of-range life", () => {
    const max = FLASH_TUNING.death.life;
    expect(flashVisual(8, max, false)).toEqual(flashVisual(8, max, false));
    // life > maxLife clamps to the fresh end; life < 0 clamps to the dead end.
    expect(flashVisual(max + 5, max, false)).toEqual(flashVisual(max, max, false));
    expect(flashVisual(-3, max, false).alpha).toBeCloseTo(0, 6);
  });
});
