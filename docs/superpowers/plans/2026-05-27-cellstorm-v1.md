# Cellstorm V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the internal tooling that turns deterministic cellular-battle simulations into ranked, previewable, renderable YouTube Shorts — a shared deterministic sim core, a headless drama scorer, a resumable sweep engine with durable SQLite storage, a harness to browse/replay/tune candidates, a shared renderer + HUD compositor, a 4K60 render app, and a dev experimentation lab.

**Architecture:** One pure-logic deterministic sim core (`@cellstorm/sim`) consumed by three runtimes — a headless Node scorer, a browser harness, and a Playwright renderer — plus a dev lab. Determinism (seed → identical battle) is the central contract: a single seeded PRNG, fixed timestep, no wall-clock reads. The scorer reads an event log the sim emits; that same log drives the harness drama-curve and the future audio layer. The render package is shared by harness preview and final render so preview == render (WYSIWYG).

**Tech Stack:** TypeScript, pnpm workspaces, Vite, PixiJS (WebGL), Vitest, better-sqlite3, Node worker_threads, Playwright, ffmpeg.

---

## File Structure

```
cellstorm/
  package.json                      # pnpm workspace root, shared scripts
  pnpm-workspace.yaml
  tsconfig.base.json
  vitest.config.ts                  # root test config (projects)
  packages/
    sim/
      package.json
      src/
        prng.ts        # seeded mulberry32 PRNG
        types.ts       # Cell, Projectile, Particle, World, BattleConfig, events
        powers.ts      # the 20 powers as data + Power type
        config.ts      # defaults, tunable constants, config validation/normalization
        world.ts       # world construction, spatial hash, spawn
        ai.ts          # 4-state decision pass
        systems/
          movement.ts  # state-driven movement forces + integration + bounds
          abilities.ts # sniper/charger/necromancer/lifebloom/magnet + status ticks
          collision.ts # cell-cell + projectile collision, damage resolution
          spawn.ts     # apply pending (splitter/necro) spawns, compact dead
        events.ts      # event types + EventSink
        step.ts        # one fixed-timestep tick -> events
        battle.ts      # runBattle(config) -> { log, summary } headless driver
        index.ts
      test/...
    score/
      package.json
      src/
        types.ts       # ScoreProfile, DramaReport, BattleLog
        metrics.ts     # gates + weighted components
        index.ts       # score(log, profile) -> DramaReport
      test/...
    render/
      package.json
      src/
        theme.ts       # palette + background (prototype baseline), editable
        scene.ts       # PixiScene: draw world each frame
        fx.ts          # cosmetic particle/FX (cosmetic RNG)
        hud/
          types.ts     # HudConfig
          counters.ts
          leaderboard.ts
          intro.ts
          winner.ts
          compositor.ts # orchestrates HUD elements over the scene
        player.ts      # BattlePlayer: owns sim + scene + hud, step/seek/play
        index.ts
      test/...
  apps/
    cli/
      package.json
      src/
        sweepSpec.ts   # SweepSpec type + expand() into BattleConfig[]
        store.ts       # SQLite store: index + cached logs
        runner.ts      # worker-pool sweep job, incremental flush, stop/resume
        worker.ts      # worker_threads entry: config -> {summary, log}
        cli.ts         # CLI entry (sweep/list/resume/stop commands)
      test/...
    harness/
      package.json
      index.html
      vite.config.ts
      src/
        main.ts
        api.ts         # talks to store (via local server or direct)
        server.ts      # tiny Node bridge: harness <-> SQLite store + sweep control
        ui/
          sweepBuilder.ts
          rankedGrid.ts
          sparkline.ts
          playerPanel.ts
          hudEditor.ts
          tuningPanel.ts
        styles.css
    renderer/
      package.json
      src/
        renderBattle.ts # Playwright drives player frame-by-frame -> PNG frames
        encode.ts       # ffmpeg frames -> mp4
        cli.ts
    lab/
      package.json
      src/
        roundRobin.ts   # power vs power win-rate matrix
        balance.ts      # per-power analytics
        scoreDiff.ts    # compare two ScoreProfiles over a battle set
        snapshot.ts     # regression: locked seeds -> expected outcomes
        cli.ts
```

---

## Phase 0 — Monorepo scaffold

### Task 0.1: Workspace root

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "cellstorm",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b",
    "harness": "pnpm --filter @cellstorm/harness dev",
    "sweep": "pnpm --filter @cellstorm/cli start"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "composite": true,
    "verbatimModuleSyntax": false
  }
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["packages/**/test/**/*.test.ts", "apps/**/test/**/*.test.ts"] },
});
```

- [ ] **Step 5: Install and commit**

```bash
cd ~/Developer/cellstorm && pnpm install
git add -A && git commit -m "chore: pnpm workspace scaffold"
```
Expected: `pnpm install` completes; lockfile created.

---

## Phase 1 — `@cellstorm/sim` (deterministic core)

> This is the determinism contract. Every randomness source is the seeded PRNG. No `Math.random`, no `Date.now`.

### Task 1.1: Seeded PRNG

**Files:**
- Create: `packages/sim/package.json`, `packages/sim/tsconfig.json`, `packages/sim/src/prng.ts`
- Test: `packages/sim/test/prng.test.ts`

- [ ] **Step 1: Create `packages/sim/package.json`**

```json
{
  "name": "@cellstorm/sim",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

- [ ] **Step 2: Create `packages/sim/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

- [ ] **Step 3: Write the failing test** — `packages/sim/test/prng.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { makePrng } from "../src/prng";

describe("makePrng", () => {
  it("is deterministic for a given seed", () => {
    const a = makePrng(12345);
    const b = makePrng(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });
  it("returns floats in [0,1)", () => {
    const r = makePrng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("differs across seeds", () => {
    expect(makePrng(1)()).not.toEqual(makePrng(2)());
  });
});
```

- [ ] **Step 4: Run, verify fail** — `pnpm vitest run packages/sim/test/prng.test.ts` → FAIL (module not found).

- [ ] **Step 5: Implement** — `packages/sim/src/prng.ts`

```ts
/** Deterministic mulberry32 PRNG. Returns a function producing floats in [0,1). */
export type Prng = () => number;

export function makePrng(seed: number): Prng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n). */
export function randInt(prng: Prng, n: number): number {
  return Math.floor(prng() * n);
}

/** Fisher-Yates shuffle in place using prng; returns the same array. */
export function shuffle<T>(prng: Prng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(prng, i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
```

- [ ] **Step 6: Run, verify pass.** Then commit.

```bash
git add -A && git commit -m "feat(sim): seeded mulberry32 PRNG"
```

### Task 1.2: Core types + powers data

**Files:**
- Create: `packages/sim/src/types.ts`, `packages/sim/src/powers.ts`
- Test: `packages/sim/test/powers.test.ts`

- [ ] **Step 1: Create `packages/sim/src/types.ts`**

```ts
export interface Power {
  name: string;
  hp?: number; speed?: number; damage?: number; radius?: number;
  aggro?: boolean; hold?: boolean; healer?: boolean;
  heal?: number; regen?: number; auraHeal?: number; auraR?: number;
  multiply?: number; explode?: boolean;
  shoot?: boolean; shootCD?: number; projDamage?: number; projSpeed?: number;
  pull?: boolean; pullR?: number;
  revive?: boolean; reviveCD?: number;
  infect?: number; plagueDPS?: number; stun?: number;
  dmgReduce?: number; reflect?: number; frenzy?: boolean;
  charge?: boolean; chargeCD?: number; chargeBurst?: number; chargeForce?: number;
}

export interface Cell {
  id: number; team: number;
  x: number; y: number; vx: number; vy: number;
  hp: number; maxHp: number; radius: number;
  alive: boolean;
  state: "engage" | "retreat" | "regroup" | "hunt";
  aiPhase: number;
  tx: number | null; ty: number | null;
  acx: number | null; acy: number | null; avx: number; avy: number;
  stunT: number; plagueT: number;
  cdShoot: number; cdCharge: number; cdRevive: number; dash: number;
}

export interface Projectile {
  x: number; y: number; vx: number; vy: number;
  team: number; damage: number; life: number;
}

export interface Corpse { x: number; y: number; team: number; age: number; }

export interface ArenaParams { width: number; height: number; }

export interface BattleConfig {
  seed: number;
  teamCount: number;
  powers: string[];        // power name per team, length === teamCount
  totalCells: number;      // default 900
  arena: ArenaParams;      // default 280x498 (will scale at render time)
  maxTicks: number;        // hard cap
}

export interface TeamCountSnapshot { tick: number; counts: number[]; }
```

- [ ] **Step 2: Write failing test** — `packages/sim/test/powers.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { POWERS, powerByName } from "../src/powers";

describe("powers", () => {
  it("has exactly 20 powers with unique names", () => {
    expect(POWERS).toHaveLength(20);
    expect(new Set(POWERS.map((p) => p.name)).size).toBe(20);
  });
  it("looks up by name", () => {
    expect(powerByName("Tank").hp).toBe(2.4);
  });
  it("throws on unknown power", () => {
    expect(() => powerByName("Nope")).toThrow();
  });
});
```

- [ ] **Step 3: Run, verify fail.**

- [ ] **Step 4: Implement** — `packages/sim/src/powers.ts` (ported verbatim from `battle.html`)

```ts
import type { Power } from "./types";

export const POWERS: Power[] = [
  { name: "Berserker", speed: 1.45, damage: 1.6, aggro: true },
  { name: "Tank", hp: 2.4, speed: 0.6, radius: 1.35, damage: 1.2, hold: true },
  { name: "Vampire", heal: 0.85, healer: true },
  { name: "Splitter", multiply: 0.55 },
  { name: "Bomb", explode: true, aggro: true },
  { name: "Swift", speed: 1.85, hp: 0.75 },
  { name: "Brute", damage: 2, speed: 0.9, radius: 1.15, aggro: true },
  { name: "Sniper", shoot: true, shootCD: 55, projDamage: 3.5, projSpeed: 4.2, hp: 0.8 },
  { name: "Magnet", pull: true, pullR: 60, hp: 1.1 },
  { name: "Necromancer", revive: true, reviveCD: 90, hp: 0.9 },
  { name: "Plague", infect: 200, plagueDPS: 0.07 },
  { name: "Shielder", dmgReduce: 0.5, speed: 0.85 },
  { name: "Regen", regen: 0.18, hp: 1.2 },
  { name: "Frenzy", frenzy: true, speed: 1.1 },
  { name: "Lifebloom", auraHeal: 0.35, auraR: 32, damage: 0.85 },
  { name: "Charger", charge: true, chargeCD: 75, chargeBurst: 3.2, chargeForce: 2.6, aggro: true },
  { name: "Goliath", radius: 2.4, hp: 3.5, damage: 2, speed: 0.48, hold: true },
  { name: "Reflector", reflect: 0.55, hp: 1.3, speed: 0.85 },
  { name: "Stunner", stun: 26, speed: 1.05 },
  { name: "Glasshammer", damage: 3.3, hp: 0.42, speed: 1.3, aggro: true },
];

const BY_NAME = new Map(POWERS.map((p) => [p.name, p]));
export function powerByName(name: string): Power {
  const p = BY_NAME.get(name);
  if (!p) throw new Error(`Unknown power: ${name}`);
  return p;
}
export const POWER_NAMES = POWERS.map((p) => p.name);
```

- [ ] **Step 5: Run, verify pass. Commit** `feat(sim): core types + 20 powers data`.

### Task 1.3: Config defaults + normalization

**Files:** Create `packages/sim/src/config.ts`; Test `packages/sim/test/config.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { normalizeConfig, DEFAULTS } from "../src/config";

describe("normalizeConfig", () => {
  it("fills defaults", () => {
    const c = normalizeConfig({ seed: 5, teamCount: 3, powers: ["Tank", "Plague", "Sniper"] });
    expect(c.totalCells).toBe(DEFAULTS.totalCells);
    expect(c.arena.width).toBe(DEFAULTS.arena.width);
    expect(c.maxTicks).toBe(DEFAULTS.maxTicks);
  });
  it("rejects powers length != teamCount", () => {
    expect(() => normalizeConfig({ seed: 1, teamCount: 2, powers: ["Tank"] })).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — `packages/sim/src/config.ts`

```ts
import type { BattleConfig } from "./types";

export const DEFAULTS = {
  totalCells: 900,
  arena: { width: 280, height: 498 },
  maxTicks: 60 * 75, // 75s @ 60fps hard cap
} as const;

export type BattleConfigInput =
  Pick<BattleConfig, "seed" | "teamCount" | "powers"> & Partial<BattleConfig>;

export function normalizeConfig(input: BattleConfigInput): BattleConfig {
  if (input.powers.length !== input.teamCount) {
    throw new Error(`powers length ${input.powers.length} != teamCount ${input.teamCount}`);
  }
  if (input.teamCount < 2 || input.teamCount > 6) {
    throw new Error(`teamCount must be 2..6, got ${input.teamCount}`);
  }
  return {
    seed: input.seed,
    teamCount: input.teamCount,
    powers: input.powers,
    totalCells: input.totalCells ?? DEFAULTS.totalCells,
    arena: input.arena ?? { ...DEFAULTS.arena },
    maxTicks: input.maxTicks ?? DEFAULTS.maxTicks,
  };
}
```

- [ ] **Step 4: Run, verify pass. Commit** `feat(sim): config defaults + normalization`.

### Task 1.4: World construction + spatial hash

**Files:** Create `packages/sim/src/world.ts`; Test `packages/sim/test/world.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { createWorld } from "../src/world";
import { normalizeConfig } from "../src/config";

const cfg = normalizeConfig({ seed: 42, teamCount: 3, powers: ["Tank", "Plague", "Sniper"] });

describe("createWorld", () => {
  it("spawns totalCells split across teams", () => {
    const w = createWorld(cfg);
    expect(w.cells.length).toBe(cfg.totalCells);
    const perTeam = Math.round(cfg.totalCells / cfg.teamCount);
    for (let t = 0; t < cfg.teamCount; t++) {
      expect(w.cells.filter((c) => c.team === t).length).toBe(perTeam);
    }
  });
  it("is deterministic: same seed -> identical initial positions", () => {
    const a = createWorld(cfg), b = createWorld(cfg);
    expect(a.cells.map((c) => [c.x, c.y])).toEqual(b.cells.map((c) => [c.x, c.y]));
  });
  it("assigns unique ids and aiPhase in 0..7", () => {
    const w = createWorld(cfg);
    expect(new Set(w.cells.map((c) => c.id)).size).toBe(w.cells.length);
    for (const c of w.cells) expect(c.aiPhase).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — `packages/sim/src/world.ts`

```ts
import type { BattleConfig, Cell, Corpse, Projectile, Power } from "./types";
import { makePrng, randInt, type Prng } from "./prng";
import { powerByName } from "./powers";

export const GRID_SIZE = 14;
export const BASE_HP = 45;
export const BASE_RADIUS = 3;

export interface World {
  cfg: BattleConfig;
  prng: Prng;
  teamPowers: Power[];
  cells: Cell[];
  projectiles: Projectile[];
  corpses: Corpse[];
  pending: Cell[];
  grid: number[][];
  gw: number; gh: number;
  frame: number;
  nextId: number;
  winner: number;            // -2 unresolved, -1 tie/extinct, >=0 team
  lastChangeFrame: number;   // for stalemate detection
}

export function makeCell(w: World, team: number, x: number, y: number): Cell {
  const p = w.teamPowers[team]!;
  const hp = BASE_HP * (p.hp ?? 1);
  return {
    id: w.nextId++, team, x, y,
    vx: (w.prng() - 0.5) * 0.5, vy: (w.prng() - 0.5) * 0.5,
    hp, maxHp: hp, radius: BASE_RADIUS * (p.radius ?? 1),
    alive: true, state: "engage", aiPhase: randInt(w.prng, 8),
    tx: null, ty: null, acx: null, acy: null, avx: 0, avy: 0,
    stunT: 0, plagueT: 0,
    cdShoot: randInt(w.prng, 30), cdCharge: randInt(w.prng, 40), cdRevive: randInt(w.prng, 60),
    dash: 0,
  };
}

export function createWorld(cfg: BattleConfig): World {
  const prng = makePrng(cfg.seed);
  const { width: W, height: H } = cfg.arena;
  const gw = Math.ceil(W / GRID_SIZE), gh = Math.ceil(H / GRID_SIZE);
  const grid: number[][] = Array.from({ length: gw * gh }, () => []);
  const w: World = {
    cfg, prng, teamPowers: cfg.powers.map(powerByName),
    cells: [], projectiles: [], corpses: [], pending: [],
    grid, gw, gh, frame: 0, nextId: 0, winner: -2, lastChangeFrame: 0,
  };
  const perTeam = Math.round(cfg.totalCells / cfg.teamCount);
  for (let t = 0; t < cfg.teamCount; t++) {
    const angle = (t / cfg.teamCount) * Math.PI * 2 - Math.PI / 2;
    const r = Math.min(W, H) * 0.34;
    const tcx = W / 2 + Math.cos(angle) * r;
    const tcy = H / 2 + Math.sin(angle) * r;
    for (let i = 0; i < perTeam; i++) {
      const a = w.prng() * Math.PI * 2;
      const rr = Math.sqrt(w.prng()) * 26;
      w.cells.push(makeCell(w, t, tcx + Math.cos(a) * rr, tcy + Math.sin(a) * rr));
    }
  }
  return w;
}

export function rebuildGrid(w: World): void {
  for (const cell of w.grid) cell.length = 0;
  const { width: W, height: H } = w.cfg.arena;
  for (let i = 0; i < w.cells.length; i++) {
    const c = w.cells[i]!;
    if (!c.alive) continue;
    let gx = Math.floor(c.x / GRID_SIZE), gy = Math.floor(c.y / GRID_SIZE);
    gx = gx < 0 ? 0 : gx >= w.gw ? w.gw - 1 : gx;
    gy = gy < 0 ? 0 : gy >= w.gh ? w.gh - 1 : gy;
    w.grid[gy * w.gw + gx]!.push(i);
  }
}

export function teamCounts(w: World): number[] {
  const counts = new Array(w.cfg.teamCount).fill(0);
  for (const c of w.cells) if (c.alive) counts[c.team]++;
  return counts;
}
```

- [ ] **Step 4: Run, verify pass. Commit** `feat(sim): world construction + spatial hash`.

### Task 1.5: Events + EventSink

**Files:** Create `packages/sim/src/events.ts`; Test `packages/sim/test/events.test.ts`

- [ ] **Step 1: Failing test**

```ts
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
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — `packages/sim/src/events.ts`

```ts
export type SimEvent =
  | { type: "death"; tick: number; cellId: number; x: number; y: number; team: number }
  | { type: "kill"; tick: number; killerTeam: number; victimTeam: number }
  | { type: "explosion"; tick: number; x: number; y: number; team: number }
  | { type: "projectileFire"; tick: number; team: number }
  | { type: "leadChange"; tick: number; team: number }
  | { type: "battleEnd"; tick: number; winner: number };

export class EventSink {
  tick = 0;
  events: SimEvent[] = [];
  death(cellId: number, x: number, y: number, team: number) {
    this.events.push({ type: "death", tick: this.tick, cellId, x, y, team });
  }
  kill(killerTeam: number, victimTeam: number) {
    this.events.push({ type: "kill", tick: this.tick, killerTeam, victimTeam });
  }
  explosion(x: number, y: number, team: number) {
    this.events.push({ type: "explosion", tick: this.tick, x, y, team });
  }
  fire(team: number) { this.events.push({ type: "projectileFire", tick: this.tick, team }); }
  leadChange(team: number) { this.events.push({ type: "leadChange", tick: this.tick, team }); }
  end(winner: number) { this.events.push({ type: "battleEnd", tick: this.tick, winner }); }
}
```

- [ ] **Step 4: Run, verify pass. Commit** `feat(sim): event types + sink`.

### Task 1.6: AI decision pass

**Files:** Create `packages/sim/src/ai.ts`; Test `packages/sim/test/ai.test.ts`

- [ ] **Step 1: Failing test** (behavioral: aggro always engages; low-hp non-hold retreats)

```ts
import { describe, it, expect } from "vitest";
import { createWorld, rebuildGrid } from "../src/world";
import { decide } from "../src/ai";
import { normalizeConfig } from "../src/config";

describe("decide", () => {
  it("aggro power always engages when enemies near", () => {
    const cfg = normalizeConfig({ seed: 1, teamCount: 2, powers: ["Berserker", "Tank"] });
    const w = createWorld(cfg);
    rebuildGrid(w);
    const berserker = w.cells.find((c) => c.team === 0)!;
    berserker.aiPhase = w.frame % 8; // force decision this frame
    decide(w, berserker);
    expect(berserker.state).toBe("engage");
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — `packages/sim/src/ai.ts` (ported scan + scoring; uses `aiPhase`)

```ts
import type { Cell } from "./types";
import { GRID_SIZE, type World } from "./world";

const SR2 = 2500;

/** Run the perception scan + state selection for one cell. Caller gates on aiPhase. */
export function decide(w: World, c: Cell): void {
  const p = w.teamPowers[c.team]!;
  const gx = Math.floor(c.x / GRID_SIZE), gy = Math.floor(c.y / GRID_SIZE);
  let allyCount = 0, enemyCount = 0;
  let acx = 0, acy = 0, avx = 0, avy = 0;
  let bestTX = 0, bestTY = 0, bestScore = -1;
  for (let dgy = -3; dgy <= 3; dgy++) {
    for (let dgx = -3; dgx <= 3; dgx++) {
      const ngx = gx + dgx, ngy = gy + dgy;
      if (ngx < 0 || ngx >= w.gw || ngy < 0 || ngy >= w.gh) continue;
      const list = w.grid[ngy * w.gw + ngx]!;
      for (const idx of list) {
        const o = w.cells[idx]!;
        if (!o.alive || o === c) continue;
        const dx = o.x - c.x, dy = o.y - c.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > SR2) continue;
        if (o.team === c.team) {
          allyCount++; acx += o.x; acy += o.y; avx += o.vx; avy += o.vy;
        } else {
          enemyCount++;
          const score = 3500 / (d2 + 60) + (1 - o.hp / o.maxHp) * 5;
          if (score > bestScore) { bestScore = score; bestTX = o.x; bestTY = o.y; }
        }
      }
    }
  }
  if (allyCount > 0) { acx /= allyCount; acy /= allyCount; avx /= allyCount; avy /= allyCount; }
  const hpFrac = c.hp / c.maxHp;
  let state: Cell["state"] = enemyCount > 0 ? "engage" : "hunt";
  if (p.aggro) state = "engage";
  else if (p.healer && hpFrac < 0.95 && enemyCount > 0) state = "engage";
  else if (!p.hold && hpFrac < 0.28 && allyCount > 0) state = "retreat";
  else if (!p.hold && !p.aggro && enemyCount > allyCount + 2 && allyCount > 1) state = "regroup";
  c.state = state;
  c.tx = bestScore > -1 ? bestTX : null;
  c.ty = bestScore > -1 ? bestTY : null;
  c.acx = allyCount > 0 ? acx : null;
  c.acy = allyCount > 0 ? acy : null;
  c.avx = avx; c.avy = avy;
}
```

- [ ] **Step 4: Run, verify pass. Commit** `feat(sim): AI decision pass with aiPhase scheduling`.

### Task 1.7: Damage + death resolution

**Files:** Create `packages/sim/src/systems/damage.ts`; Test `packages/sim/test/damage.test.ts`

- [ ] **Step 1: Failing test** — reflect damages attacker; vampire heals on hit; lethal triggers death+kill event.

```ts
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
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — `packages/sim/src/systems/damage.ts` (port of `applyDamage`/`handleDeath`/`explode`)

```ts
import type { Cell } from "../types";
import { makeCell, type World } from "../world";
import type { EventSink } from "../events";

export function handleDeath(w: World, sink: EventSink, c: Cell, killer: Cell | null): void {
  if (!c.alive) return;
  c.alive = false;
  sink.death(c.id, c.x, c.y, c.team);
  w.corpses.push({ x: c.x, y: c.y, team: c.team, age: 0 });
  if (w.corpses.length > 220) w.corpses.shift();
  const pC = w.teamPowers[c.team]!;
  if (killer && killer.alive) {
    sink.kill(killer.team, c.team);
    const pK = w.teamPowers[killer.team]!;
    if (pK.multiply && w.prng() < pK.multiply && w.cells.length + w.pending.length < 1500) {
      const n = makeCell(w, killer.team, killer.x + (w.prng() - 0.5) * 8, killer.y + (w.prng() - 0.5) * 8);
      n.vx = (w.prng() - 0.5) * 1.6; n.vy = (w.prng() - 0.5) * 1.6;
      w.pending.push(n);
    }
  }
  if (pC.explode) explode(w, sink, c.x, c.y, c.team);
}

export function explode(w: World, sink: EventSink, x: number, y: number, killerTeam: number): void {
  sink.explosion(x, y, killerTeam);
  for (const o of w.cells) {
    if (!o.alive || o.team === killerTeam) continue;
    const dx = o.x - x, dy = o.y - y, d2 = dx * dx + dy * dy;
    if (d2 < 800) {
      const d = Math.sqrt(d2 + 0.01);
      o.hp -= 7; o.vx += (dx / d) * 1.6; o.vy += (dy / d) * 1.6;
      if (o.hp <= 0 && o.alive) handleDeath(w, sink, o, null);
    }
  }
}

export function applyDamage(w: World, sink: EventSink, attacker: Cell | null, target: Cell, base: number): void {
  if (!target.alive) return;
  const pA = attacker ? w.teamPowers[attacker.team]! : null;
  const pT = w.teamPowers[target.team]!;
  let dmg = base * (pA?.damage ?? 1);
  if (pA?.frenzy && attacker) dmg *= 1 + (1 - attacker.hp / attacker.maxHp) * 1.6;
  if (pT.dmgReduce) dmg *= 1 - pT.dmgReduce;
  target.hp -= dmg;
  if (pT.reflect && attacker && attacker.alive) {
    attacker.hp -= dmg * pT.reflect;
    if (attacker.hp <= 0) handleDeath(w, sink, attacker, target);
  }
  if (pA?.heal && attacker && attacker.alive) attacker.hp = Math.min(attacker.maxHp, attacker.hp + pA.heal);
  if (pA?.infect) target.plagueT = Math.max(target.plagueT, pA.infect);
  if (pA?.stun) target.stunT = Math.max(target.stunT, pA.stun);
  if (target.hp <= 0) handleDeath(w, sink, target, attacker);
}
```

- [ ] **Step 4: Run, verify pass. Commit** `feat(sim): damage/death/explosion resolution`.

### Task 1.8: Movement + abilities + collision systems

**Files:** Create `packages/sim/src/systems/movement.ts`, `abilities.ts`, `collision.ts`, `spawn.ts`; Test `packages/sim/test/systems.test.ts`

> Port the per-cell update body, magnet pass, projectile pass, collision pass, pending-spawn + corpse aging from `battle.html` `step()` (lines ~388-702), split by responsibility. `movement.ts` integrates velocity/position with damping, vmax (×1.5 on dash), and wall bounce. `abilities.ts` handles stun/plague/regen ticks, shoot, charge, revive, lifebloom aura, and the magnet pass. `collision.ts` handles projectile movement+collision and cell-cell push+damage. `spawn.ts` appends `pending` then swap-removes dead cells (compaction) and ages corpses.

- [ ] **Step 1: Failing test** — projectile hitting an enemy applies damage and is consumed; collision between cross-team overlapping cells reduces hp.

```ts
import { describe, it, expect } from "vitest";
import { createWorld, rebuildGrid } from "../src/world";
import { EventSink } from "../src/events";
import { collisionSystem } from "../src/systems/collision";
import { normalizeConfig } from "../src/config";

describe("collisionSystem", () => {
  it("cross-team overlap deals damage", () => {
    const cfg = normalizeConfig({ seed: 1, teamCount: 2, powers: ["Brute", "Tank"] });
    const w = createWorld(cfg);
    const a = w.cells.find((c) => c.team === 0)!;
    const b = w.cells.find((c) => c.team === 1)!;
    a.x = 50; a.y = 50; b.x = 51; b.y = 50; // overlapping
    const hpBefore = b.hp;
    rebuildGrid(w);
    collisionSystem(w, new EventSink());
    expect(b.hp).toBeLessThan(hpBefore);
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** the four system files. Signatures:

```ts
// movement.ts
export function movementSystem(w: World): void;        // per-cell integrate + bounds (skips stunned handled in abilities)
// abilities.ts
export function abilitiesSystem(w: World, sink: EventSink): void; // status ticks, shoot/charge/revive/aura, magnet pass
// collision.ts
export function collisionSystem(w: World, sink: EventSink): void; // projectiles + cell-cell
// spawn.ts
export function resolveSpawnsAndCompact(w: World): void; // append pending, swap-remove dead, age corpses
```

Port the exact numeric constants from `battle.html` (damping 0.93, vmax 2.6, melee base 1.4, magnet 0.07, projectile life 28, proj range 95, charge range 40, revive range 60, aura every 4 frames, corpse age 300). Replace every `Math.random()` with `w.prng()`. Movement decision gating uses `w.frame % 8 === c.aiPhase` to call `decide(w, c)`.

- [ ] **Step 4: Run, verify pass. Commit** `feat(sim): movement/abilities/collision/spawn systems`.

### Task 1.9: `step()` + winner/stalemate detection

**Files:** Create `packages/sim/src/step.ts`; Test `packages/sim/test/step.test.ts`

- [ ] **Step 1: Failing test** — stepping reduces total population over time; winner set when one team remains; stalemate flagged.

```ts
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
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — `packages/sim/src/step.ts`

```ts
import { rebuildGrid, teamCounts, type World } from "./world";
import { decide } from "./ai";
import { movementSystem } from "./systems/movement";
import { abilitiesSystem } from "./systems/abilities";
import { collisionSystem } from "./systems/collision";
import { resolveSpawnsAndCompact } from "./systems/spawn";
import type { EventSink } from "./events";

const STALEMATE_TICKS = 60 * 12; // 12s of no elimination

/** Advance one fixed tick. Returns true when the battle has ended. */
export function step(w: World, sink: EventSink): boolean {
  w.frame++;
  sink.tick = w.frame;
  rebuildGrid(w);
  for (const c of w.cells) {
    if (c.alive && w.frame % 8 === c.aiPhase) decide(w, c);
  }
  movementSystem(w);
  abilitiesSystem(w, sink);
  collisionSystem(w, sink);
  resolveSpawnsAndCompact(w);

  const counts = teamCounts(w);
  const live = counts.filter((n) => n > 0).length;
  const totalAlive = counts.reduce((a, b) => a + b, 0);
  if (w.prevTotal === undefined || totalAlive !== w.prevTotal) {
    w.prevTotal = totalAlive; w.lastChangeFrame = w.frame;
  }
  if (live <= 1) {
    w.winner = live === 1 ? counts.findIndex((n) => n > 0) : -1;
    sink.end(w.winner);
    return true;
  }
  if (w.frame - w.lastChangeFrame > STALEMATE_TICKS || w.frame >= w.cfg.maxTicks) {
    w.winner = -1; // unresolved/stalemate
    sink.end(w.winner);
    return true;
  }
  return false;
}
```

(Add `prevTotal?: number` to the `World` interface in `world.ts`.)

- [ ] **Step 4: Run, verify pass. Commit** `feat(sim): step() with winner + stalemate detection`.

### Task 1.10: `runBattle` headless driver + BattleLog + determinism gate

**Files:** Create `packages/sim/src/battle.ts`, `packages/sim/src/index.ts`; Test `packages/sim/test/determinism.test.ts`

- [ ] **Step 1: Failing test (THE determinism contract)**

```ts
import { describe, it, expect } from "vitest";
import { runBattle } from "../src/battle";
import { normalizeConfig } from "../src/config";

const cfg = normalizeConfig({ seed: 999, teamCount: 4, powers: ["Tank", "Plague", "Sniper", "Swift"] });

describe("runBattle determinism", () => {
  it("produces identical event logs across two runs", () => {
    const a = runBattle(cfg);
    const b = runBattle(cfg);
    expect(a.log.events).toEqual(b.log.events);
    expect(a.summary).toEqual(b.summary);
  });
  it("produces a per-tick team-count timeline", () => {
    const { log } = runBattle(cfg);
    expect(log.timeline.length).toBeGreaterThan(0);
    expect(log.timeline[0]!.counts.length).toBe(cfg.teamCount);
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — `packages/sim/src/battle.ts`

```ts
import type { BattleConfig, TeamCountSnapshot } from "./types";
import type { SimEvent } from "./events";
import { EventSink } from "./events";
import { createWorld, teamCounts } from "./world";
import { step } from "./step";

export interface BattleLog {
  config: BattleConfig;
  events: SimEvent[];
  timeline: TeamCountSnapshot[]; // sampled team counts
  durationTicks: number;
  winner: number;
}
export interface BattleSummary {
  winner: number;
  durationTicks: number;
  survivors: number;       // winner's surviving cell count
  resolved: boolean;       // true winner vs stalemate
}
const SAMPLE_EVERY = 6; // 10 samples/sec

export function runBattle(cfg: BattleConfig): { log: BattleLog; summary: BattleSummary } {
  const w = createWorld(cfg);
  const sink = new EventSink();
  const timeline: TeamCountSnapshot[] = [];
  let ended = false;
  while (!ended) {
    ended = step(w, sink);
    if (w.frame % SAMPLE_EVERY === 0 || ended) timeline.push({ tick: w.frame, counts: teamCounts(w) });
  }
  const counts = teamCounts(w);
  const survivors = w.winner >= 0 ? counts[w.winner]! : 0;
  return {
    log: { config: cfg, events: sink.events, timeline, durationTicks: w.frame, winner: w.winner },
    summary: { winner: w.winner, durationTicks: w.frame, survivors, resolved: w.winner >= 0 },
  };
}
```

`packages/sim/src/index.ts` re-exports: `runBattle`, `createWorld`, `step`, `POWERS`, `POWER_NAMES`, `normalizeConfig`, `DEFAULTS`, all types, `BattleLog`, `BattleSummary`, `EventSink`, `SimEvent`.

- [ ] **Step 4: Run, verify pass. Commit** `feat(sim): runBattle driver + determinism gate (green)`.

---

## Phase 2 — `@cellstorm/score`

### Task 2.1: ScoreProfile + DramaReport types

**Files:** Create `packages/score/package.json`, `tsconfig.json`, `src/types.ts`

- [ ] **Step 1:** `package.json` (name `@cellstorm/score`, deps `@cellstorm/sim: workspace:*`), `tsconfig.json` extends base.

- [ ] **Step 2:** `src/types.ts`

```ts
import type { BattleLog } from "@cellstorm/sim";
export type { BattleLog };

export interface ScoreProfile {
  targetMinSec: number;   // default 30
  targetMaxSec: number;   // default 60
  fps: number;            // 60
  maxStalemateSec: number;// dead-air gate, default 8
  weights: {
    leadVolatility: number;
    comeback: number;
    climaxTiming: number;
    closeFinish: number;
    sustainedChaos: number;
  };
}

export const DEFAULT_PROFILE: ScoreProfile = {
  targetMinSec: 30, targetMaxSec: 60, fps: 60, maxStalemateSec: 8,
  weights: { leadVolatility: 1, comeback: 1.5, climaxTiming: 1, closeFinish: 1, sustainedChaos: 0.5 },
};

export interface DramaReport {
  passed: boolean;
  score: number;                       // weighted sum, 0..(sum of weights)
  breakdown: Record<string, number>;   // each component 0..1 + gate flags
  reasons: string[];                   // why it failed gates, if any
}
```

- [ ] **Step 3: Commit** `feat(score): types + default profile`.

### Task 2.2: Metrics (gates + components)

**Files:** Create `packages/score/src/metrics.ts`, `src/index.ts`; Test `packages/score/test/score.test.ts`

- [ ] **Step 1: Failing test** with synthetic logs:

```ts
import { describe, it, expect } from "vitest";
import { score } from "../src/index";
import { DEFAULT_PROFILE } from "../src/types";
import type { BattleLog } from "@cellstorm/sim";

function log(partial: Partial<BattleLog>): BattleLog {
  return { config: {} as any, events: [], timeline: [], durationTicks: 0, winner: 0, ...partial };
}

describe("score gates", () => {
  it("fails a stalemate (winner -1)", () => {
    const r = score(log({ winner: -1, durationTicks: 60 * 40 }), DEFAULT_PROFILE);
    expect(r.passed).toBe(false);
    expect(r.reasons.join()).toMatch(/winner/i);
  });
  it("fails too-short battles", () => {
    const r = score(log({ winner: 0, durationTicks: 60 * 5,
      timeline: [{ tick: 0, counts: [10, 10] }, { tick: 300, counts: [10, 0] }] }), DEFAULT_PROFILE);
    expect(r.passed).toBe(false);
  });
  it("passes a clean 40s single-winner battle", () => {
    const tl = [];
    for (let i = 0; i <= 40; i++) tl.push({ tick: i * 60, counts: [Math.max(0, 20 - i), Math.max(0, i - 5)] });
    const r = score(log({ winner: 1, durationTicks: 60 * 40, timeline: tl }), DEFAULT_PROFILE);
    expect(r.passed).toBe(true);
    expect(r.score).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `metrics.ts` (gates first, then components) and `index.ts` `score()`:

```ts
// index.ts
import type { BattleLog } from "@cellstorm/sim";
import { type ScoreProfile, type DramaReport } from "./types";
import { runGates, components } from "./metrics";

export function score(log: BattleLog, profile: ScoreProfile): DramaReport {
  const reasons = runGates(log, profile);
  if (reasons.length) return { passed: false, score: 0, breakdown: {}, reasons };
  const comp = components(log, profile);
  const w = profile.weights;
  const total =
    comp.leadVolatility * w.leadVolatility +
    comp.comeback * w.comeback +
    comp.climaxTiming * w.climaxTiming +
    comp.closeFinish * w.closeFinish +
    comp.sustainedChaos * w.sustainedChaos;
  return { passed: true, score: total, breakdown: comp, reasons: [] };
}
export * from "./types";
```

`metrics.ts` implements:
- `runGates`: winner < 0 → "no clear winner"; duration outside [min,max]·fps → "duration"; longest gap between consecutive `kill`/`death` events > maxStalemateSec·fps → "dead air".
- `components` (each normalized 0..1):
  - `leadVolatility`: count of leader changes across `timeline` (argmax of counts), normalized by `timeline.length`.
  - `comeback`: 1 − (winner's minimum share of total population over the timeline). If winner was once near 0 share → ~1.
  - `climaxTiming`: fraction of `death` events occurring in the final 20% of ticks.
  - `closeFinish`: 1 − (survivors / initialWinnerCount); few survivors → ~1. (Derive initial winner count from `timeline[0]`.)
  - `sustainedChaos`: 1 − coefficient-of-variation of death counts per timeline bucket (even spread → high).

- [ ] **Step 4: Run, verify pass. Commit** `feat(score): drama gates + weighted components`.

---

## Phase 3 — Sweep engine + persistence (`apps/cli`)

### Task 3.1: SweepSpec + expand()

**Files:** Create `apps/cli/package.json`, `tsconfig.json`, `src/sweepSpec.ts`; Test `apps/cli/test/sweepSpec.test.ts`

- [ ] **Step 1:** `package.json` (name `@cellstorm/cli`, deps `@cellstorm/sim`, `@cellstorm/score`, `better-sqlite3`, devDeps `@types/better-sqlite3`).

- [ ] **Step 2: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { expand } from "../src/sweepSpec";

describe("expand", () => {
  it("pins powers + teamCount, sweeps seeds", () => {
    const cfgs = expand({
      teamCount: 2, powers: { mode: "fixed", names: ["Tank", "Plague"] },
      seeds: { from: 0, to: 9 }, limit: 100,
    });
    expect(cfgs).toHaveLength(10);
    expect(cfgs.every((c) => c.powers.join() === "Tank,Plague")).toBe(true);
  });
  it("random mode produces distinct power sets across seeds deterministically", () => {
    const cfgs = expand({ teamCount: 3, powers: { mode: "random" }, seeds: { from: 0, to: 4 } });
    expect(cfgs).toHaveLength(5);
    cfgs.forEach((c) => expect(c.powers).toHaveLength(3));
  });
  it("respects limit", () => {
    const cfgs = expand({ teamCount: 2, powers: { mode: "random" }, seeds: { from: 0, to: 999 }, limit: 50 });
    expect(cfgs).toHaveLength(50);
  });
});
```

- [ ] **Step 3: Run, verify fail.**

- [ ] **Step 4: Implement** `src/sweepSpec.ts`

```ts
import { normalizeConfig, POWER_NAMES, type BattleConfig } from "@cellstorm/sim";
import { makePrng, randInt, shuffle } from "@cellstorm/sim/prng"; // or re-export from index

export type PowerAssignment =
  | { mode: "fixed"; names: string[] }
  | { mode: "random" }                          // pick teamCount distinct powers per seed
  | { mode: "pool"; pool: string[] };           // pick teamCount distinct from a pool

export interface SweepSpec {
  teamCount: number | number[];
  powers: PowerAssignment;
  seeds: { from: number; to: number } | number[];
  totalCells?: number;
  limit?: number;
}

function seedList(s: SweepSpec["seeds"]): number[] {
  if (Array.isArray(s)) return s;
  const out: number[] = [];
  for (let i = s.from; i <= s.to; i++) out.push(i);
  return out;
}
function teamCounts(tc: SweepSpec["teamCount"]): number[] {
  return Array.isArray(tc) ? tc : [tc];
}
function powersFor(a: PowerAssignment, teamCount: number, seed: number): string[] {
  if (a.mode === "fixed") return a.names;
  const pool = a.mode === "pool" ? [...a.pool] : [...POWER_NAMES];
  const prng = makePrng(seed ^ 0x9e3779b9); // distinct stream from sim
  return shuffle(prng, pool).slice(0, teamCount);
}

export function expand(spec: SweepSpec): BattleConfig[] {
  const out: BattleConfig[] = [];
  const seeds = seedList(spec.seeds);
  const tcs = teamCounts(spec.teamCount);
  outer: for (const tc of tcs) {
    for (const seed of seeds) {
      const powers = powersFor(spec.powers, tc, seed);
      out.push(normalizeConfig({ seed, teamCount: tc, powers, totalCells: spec.totalCells }));
      if (spec.limit && out.length >= spec.limit) break outer;
    }
  }
  return out;
}
```

(Re-export `makePrng`, `randInt`, `shuffle` from `@cellstorm/sim` index to avoid the subpath import.)

- [ ] **Step 5: Run, verify pass. Commit** `feat(cli): SweepSpec + expand()`.

### Task 3.2: SQLite store

**Files:** Create `apps/cli/src/store.ts`; Test `apps/cli/test/store.test.ts`

- [ ] **Step 1: Failing test** — insert results, query top-N by score, persists across reopen, caches logs for top-N.

```ts
import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { Store } from "../src/store";

const DB = "/tmp/cellstorm-test.db";
afterEach(() => { try { rmSync(DB); } catch {} try { rmSync(DB + "-logs", { recursive: true }); } catch {} });

describe("Store", () => {
  it("persists results and queries top-N by score", () => {
    const s = new Store(DB);
    s.insert({ configId: "a", config: {} as any, score: 5, breakdown: {}, winner: 0, durationTicks: 100, batchId: "b1" });
    s.insert({ configId: "b", config: {} as any, score: 9, breakdown: {}, winner: 1, durationTicks: 200, batchId: "b1" });
    s.close();
    const s2 = new Store(DB); // reopen
    const top = s2.topN(1);
    expect(top[0]!.configId).toBe("b");
    s2.close();
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `src/store.ts` — `better-sqlite3` with a `results` table (`configId TEXT PRIMARY KEY, config JSON, score REAL, breakdown JSON, winner INT, durationTicks INT, batchId TEXT`), indexed on `score DESC`. Methods: `insert(row)`, `insertMany(rows)` (transaction), `topN(n, batchId?)`, `count()`, `getConfig(id)`, `saveLog(id, log)` (gzip to `${db}-logs/${id}.json.gz`), `getLog(id)`. `configId` = stable hash of config (e.g. `${teamCount}:${powers.join(",")}:${seed}`).

- [ ] **Step 4: Run, verify pass. Commit** `feat(cli): SQLite store with log cache`.

### Task 3.3: Worker + runner (resumable, stoppable)

**Files:** Create `apps/cli/src/worker.ts`, `src/runner.ts`; Test `apps/cli/test/runner.test.ts`

- [ ] **Step 1: Failing test** — running a small sweep populates the store; a stop flag halts early; resume skips already-done configs.

```ts
import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { runSweep } from "../src/runner";
import { Store } from "../src/store";

const DB = "/tmp/cellstorm-runner.db";
afterEach(() => { try { rmSync(DB); } catch {} try { rmSync(DB + "-logs", { recursive: true }); } catch {} });

describe("runSweep", () => {
  it("scores a small sweep and stores results", async () => {
    await runSweep({
      spec: { teamCount: 2, powers: { mode: "random" }, seeds: { from: 0, to: 7 } },
      dbPath: DB, batchId: "t1", concurrency: 2, topNlogs: 4,
    });
    const s = new Store(DB);
    expect(s.count()).toBe(8);
    s.close();
  }, 30000);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `worker.ts` (worker_threads entry: receives a `BattleConfig`, calls `runBattle` + `score`, returns `{ summary, report, log }`) and `runner.ts`:

```ts
// runner.ts (shape)
export interface SweepJob {
  spec: SweepSpec; dbPath: string; batchId: string;
  concurrency?: number; topNlogs?: number; profile?: ScoreProfile;
  stopFlag?: () => boolean;                 // polled; harness toggles a stop file
  onProgress?: (done: number, total: number, best: number) => void;
}
export async function runSweep(job: SweepJob): Promise<void>;
```
Runner: `expand(spec)` → filter out configIds already in store (resume) → pool of N workers → as results return, buffer and `insertMany` every ~200, `saveLog` only when the running top-N threshold is met → call `onProgress` → check `stopFlag()` each batch; on stop, flush and resolve. Use a `Piscina`-style pool or hand-rolled worker_threads pool (hand-rolled to avoid the dep).

- [ ] **Step 4: Run, verify pass. Commit** `feat(cli): resumable, stoppable worker-pool sweep`.

### Task 3.4: CLI entry

**Files:** Create `apps/cli/src/cli.ts`

- [ ] **Step 1:** Implement a minimal CLI (using `node:util` `parseArgs`): subcommands `sweep` (flags: `--db`, `--teams`, `--powers random|a,b,c`, `--seeds from-to`, `--batch`, `--concurrency`, `--topn`), `list --db --n`, `stop --db` (writes a stop file the running job polls). No test required (thin I/O shell); verify manually:

```bash
pnpm --filter @cellstorm/cli exec tsx src/cli.ts sweep --db ./data/cs.db --teams 4 --powers random --seeds 0-199 --batch demo
```
Expected: progress prints, `data/cs.db` populated.

- [ ] **Step 2: Commit** `feat(cli): command-line entry (sweep/list/stop)`.

---

## Phase 4 — `@cellstorm/render` (shared scene + HUD)

> PixiJS scene + HUD compositor used by BOTH harness preview and the renderer app. FX use a cosmetic PRNG, never the sim PRNG.

### Task 4.1: Theme + Pixi scene

**Files:** Create `packages/render/package.json` (deps `@cellstorm/sim`, `pixi.js@^8`), `tsconfig.json`, `src/theme.ts`, `src/scene.ts`; Test `packages/render/test/theme.test.ts` (palette has ≥6 team colors; baseline bg matches prototype `#08070d`).

- [ ] **Step 1–4:** TDD the theme module (pure data, easily tested). `scene.ts` (PixiJS, needs a canvas) is verified in the harness, not unit-tested. Theme:

```ts
export const THEME = {
  background: 0x050008,
  pageBackground: 0x08070d,
  teams: [
    { name: "Red", color: 0xff5066 }, { name: "Blue", color: 0x5099ff },
    { name: "Gold", color: 0xffcc40 }, { name: "Green", color: 0x4ade80 },
    { name: "Purple", color: 0xc084fc }, { name: "Cyan", color: 0x22d3ee },
  ],
};
```

`scene.ts` exposes `class PixiScene { constructor(app: Application, arena: ArenaParams); draw(world: World): void; }` — batched fills per team (cells sized by hp), projectiles, cosmetic particles. Trails via a low-alpha background rect each frame (port of prototype render).

- [ ] **Step 5: Commit** `feat(render): theme + Pixi scene`.

### Task 4.2: HUD compositor

**Files:** Create `packages/render/src/hud/types.ts`, `counters.ts`, `leaderboard.ts`, `intro.ts`, `winner.ts`, `compositor.ts`

- [ ] **Step 1:** `hud/types.ts`

```ts
export interface HudConfig {
  showCounters: boolean;
  showLeaderboard: boolean;
  showIntro: boolean;
  showWinner: boolean;
  introTitle: string;        // editable, e.g. "Plague vs Tank — who wins?"
  introSeconds: number;      // length of intro hook
}
export const DEFAULT_HUD: HudConfig = {
  showCounters: true, showLeaderboard: true, showIntro: true, showWinner: true,
  introTitle: "", introSeconds: 1.5,
};
```

- [ ] **Step 2:** Each HUD module is a Pixi `Container` factory with an `update(state)` method. `compositor.ts` exposes `class Hud { constructor(app, config, teamPowers); update(counts, tick, winner): void; setConfig(c): void; }`. Counters animate toward target counts; leaderboard sorts containers by count each update; intro shows title + flash-forward thumbnail for `introSeconds`; winner fades in on `winner >= 0`.

- [ ] **Step 3:** Verified in harness. **Commit** `feat(render): config-driven HUD compositor`.

### Task 4.3: BattlePlayer

**Files:** Create `packages/render/src/player.ts`, `src/index.ts`

- [ ] **Step 1:** `class BattlePlayer` owns a `World` (from `createWorld`), `PixiScene`, `Hud`, and a cosmetic PRNG. API:

```ts
export interface PlayerOptions { config: BattleConfig; hud: HudConfig; canvas: HTMLCanvasElement | OffscreenCanvas; resolutionScale: number; }
export class BattlePlayer {
  constructor(app: Application, opts: PlayerOptions);
  stepFrame(): boolean;        // advance sim one tick + render; returns ended
  seekTo(tick: number): void;  // re-sim from 0 deterministically to tick (for scrub)
  play(): void; pause(): void; setSpeed(mult: number): void;
  get frame(): number; get ended(): boolean;
}
```

`seekTo` re-creates the world and steps to `tick` (cheap; deterministic). This is what powers scrubbing and "jump to climax".

- [ ] **Step 2:** `index.ts` re-exports `BattlePlayer`, `PixiScene`, `Hud`, `THEME`, `HudConfig`, `DEFAULT_HUD`. **Commit** `feat(render): BattlePlayer + package exports`.

---

## Phase 5 — Harness (`apps/harness`)

> Vite browser app. The centerpiece. A tiny Node bridge server exposes the store + sweep control to the browser.

### Task 5.1: Bridge server

**Files:** Create `apps/harness/package.json` (deps `@cellstorm/cli`, `@cellstorm/score`, express or `node:http`), `src/server.ts`

- [ ] **Step 1:** A `node:http` server exposing JSON endpoints: `GET /results?n=&batch=` (→ store.topN), `GET /config/:id`, `GET /log/:id` (cached or re-sim via `runBattle`), `POST /sweep` (start a `runSweep` in a child process / worker, return batchId), `GET /sweep/:batch/progress`, `POST /sweep/:batch/stop` (writes stop file). Serves the Vite-built assets in prod.

- [ ] **Step 2:** Manual verify: `curl localhost:5174/results?n=5`. **Commit** `feat(harness): bridge server over store + sweep control`.

### Task 5.2: Vite app shell + sweep builder + ranked grid + sparkline

**Files:** Create `apps/harness/index.html`, `vite.config.ts`, `src/main.ts`, `src/api.ts`, `src/ui/*.ts`, `src/styles.css`

- [ ] **Step 1:** `api.ts` typed fetch wrappers over the bridge endpoints.
- [ ] **Step 2:** `sweepBuilder.ts` — form to compose a `SweepSpec` (team count pin/sweep, per-slot power select with "fixed/random/pool", seed range, limit) + Start/Stop buttons wired to `/sweep`. Live progress readout.
- [ ] **Step 3:** `rankedGrid.ts` — fetches `/results`, renders cards (matchup colors + power names, score, winner) sorted by score; clicking a card opens the player.
- [ ] **Step 4:** `sparkline.ts` — draws the population-over-time timeline from a log onto a small canvas.
- [ ] **Step 5:** Manual verify in browser. **Commit** `feat(harness): shell + sweep builder + ranked grid + sparkline`.

### Task 5.3: Player panel + HUD editor + tuning panel

**Files:** Create `apps/harness/src/ui/playerPanel.ts`, `hudEditor.ts`, `tuningPanel.ts`

- [ ] **Step 1:** `playerPanel.ts` — instantiates a `BattlePlayer` on a canvas for the selected config; play/pause/scrub/step/speed controls; "jump to climax" using the log's last-20% death cluster.
- [ ] **Step 2:** `hudEditor.ts` — toggles for counters/leaderboard/intro/winner + intro title text input; calls `player`'s `Hud.setConfig` live.
- [ ] **Step 3:** `tuningPanel.ts` — sliders for theme + selected sim constants; re-instantiates the player on change. (Sim-constant tuning writes into the `BattleConfig`/a tuning override object.)
- [ ] **Step 4:** Manual verify. **Commit** `feat(harness): player + HUD editor + tuning panel`.

---

## Phase 6 — Renderer app (`apps/renderer`) — designed in, lower priority

### Task 6.1: Frame capture + encode

**Files:** Create `apps/renderer/package.json` (deps `playwright`, `@cellstorm/render`), `src/renderBattle.ts`, `src/encode.ts`, `src/cli.ts`

- [ ] **Step 1:** `renderBattle.ts` — launches Playwright Chromium, loads a minimal page that constructs a `BattlePlayer` at 2160×3840 with `resolutionScale` for 4K; loops: `stepFrame()` → `page.screenshot` (or canvas `toDataURL`) → write `frames/%06d.png`. Wall-clock-decoupled: one screenshot per sim tick.
- [ ] **Step 2:** `encode.ts` — spawn `ffmpeg -framerate 60 -i frames/%06d.png -c:v libx264 -pix_fmt yuv420p out.mp4`.
- [ ] **Step 3:** `cli.ts` — `render --config <json|configId> --db <db> --out out.mp4 --hud <json>`.
- [ ] **Step 4:** Manual verify on one short battle. **Commit** `feat(renderer): Playwright frame capture + ffmpeg encode`.

---

## Phase 7 — Dev lab (`apps/lab`)

### Task 7.1: Round-robin + balance analytics

**Files:** Create `apps/lab/package.json`, `src/roundRobin.ts`, `src/balance.ts`; Test `apps/lab/test/roundRobin.test.ts`

- [ ] **Step 1: Failing test** — round-robin over a small power subset returns a win-rate matrix summing sensibly.

```ts
import { describe, it, expect } from "vitest";
import { roundRobin } from "../src/roundRobin";

describe("roundRobin", () => {
  it("produces win counts for each ordered pair over seeds", () => {
    const res = roundRobin(["Tank", "Glasshammer"], { seeds: 4 });
    expect(res.winRate("Tank", "Glasshammer")).toBeGreaterThanOrEqual(0);
    expect(res.winRate("Tank", "Glasshammer")).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `roundRobin(powers, { seeds })` — for each pair, run `seeds` battles (2-team) via `runBattle`, tally winners; `winRate(a,b)`. `balance.ts` aggregates per-power overall win rate + avg duration + stalemate rate across a random sweep.
- [ ] **Step 4: Run, verify pass. Commit** `feat(lab): round-robin + balance analytics`.

### Task 7.2: Score diff + regression snapshot

**Files:** Create `apps/lab/src/scoreDiff.ts`, `src/snapshot.ts`, `src/cli.ts`; Test `apps/lab/test/snapshot.test.ts`

- [ ] **Step 1: Failing test** — snapshot of a fixed seed set is stable across runs (re-uses determinism).

```ts
import { describe, it, expect } from "vitest";
import { snapshot } from "../src/snapshot";

describe("snapshot", () => {
  it("is stable across runs", () => {
    const cfgs = [{ seed: 1, teamCount: 2, powers: ["Tank", "Plague"] }];
    expect(snapshot(cfgs as any)).toEqual(snapshot(cfgs as any));
  });
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `snapshot(configs)` → array of `{ configId, winner, durationTicks }`. `scoreDiff(logs, profileA, profileB)` → ranking difference table. `cli.ts` wires `roundrobin`, `balance`, `scorediff`, `snapshot` subcommands with table output.
- [ ] **Step 4: Run, verify pass. Commit** `feat(lab): score diff + regression snapshot + CLI`.

---

## Phase 8 — Integration & polish

### Task 8.1: Cross-runtime determinism gate

**Files:** Test `packages/render/test/parity.test.ts` (Node-side): a battle run head­lessly via `runBattle` and a battle stepped via `BattlePlayer.stepFrame()` (using a stub/headless canvas, sim only) produce identical event logs.

- [ ] Implement a sim-only parity check that constructs the player's world the same way and asserts identical `winner`/`durationTicks` vs `runBattle`. Commit `test: cross-runtime determinism parity`.

### Task 8.2: Root README + run scripts

**Files:** Create `RUNNING.md`; Modify root `package.json` scripts.

- [ ] Document: `pnpm sweep ...`, `pnpm harness`, `pnpm --filter @cellstorm/renderer ...`, `pnpm --filter @cellstorm/lab ...`. Note ffmpeg + `pnpm exec playwright install chromium` prerequisites. Commit `docs: running instructions`.

### Task 8.3: Full green + typecheck

- [ ] Run `pnpm test` and `pnpm typecheck`; fix failures. Commit `chore: full suite green`.

---

## Self-Review Notes

- **Spec coverage:** sim core (Phase 1, all improvements: seeded PRNG, two RNG streams via cosmetic PRNG in render/player, fixed timestep, aiPhase scheduling, dead-cell compaction in spawn.ts, tick-cap+stalemate in step.ts, systems split); scoring + event log (Phase 2); sweep + SQLite persistence + resumable/stoppable (Phase 3); harness A→C centerpiece (Phases 4–5); shared render/HUD WYSIWYG (Phase 4, used by both player and renderer); 4K60 renderer (Phase 6); lab (Phase 7); determinism CI gates (Tasks 1.10, 8.1). Audio explicitly phase 2 / out of scope.
- **Type consistency:** `BattleConfig`, `BattleLog`, `BattleSummary`, `SimEvent`, `ScoreProfile`, `DramaReport`, `HudConfig`, `SweepSpec`, `Store` row shape, `BattlePlayer` API are defined once and reused by name across phases.
- **Note for implementer:** re-export `makePrng/randInt/shuffle` from `@cellstorm/sim` index (Task 1.1/1.2) so `apps/cli` imports from the package root, not a subpath.
