# Cellstorm Tournament Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `apps/tournament` harness that turns a single `tournamentSeed` into one finished long-form MP4 — a 16-power single-elimination bracket (each match the best-of-N-swept 1v1), animated bracket beats between matches, a best-of-three finale, and a podium — with zero manual editing.

**Architecture:** Two passes, pure-function core. Pass 1 simulates the ENTIRE bracket (every match = best drama battle out of a swept seed range, via the existing `runBattle` + `score`) and resolves a best-of-three finale, producing a pure `TournamentResult` that is a deterministic function of the seed. Pass 2 renders each battle through the existing `@cellstorm/renderer` (cold-open disabled, intro scrim off, synth SFX kept), renders two NEW tick-driven DOM/CSS scenes (bracket animation + podium + intro reveal) through the SAME Playwright→`encode()` path so every segment shares one codec/resolution/fps/pixel-format/audio profile, then `ffmpeg -f concat -c copy` stitches them into one MP4.

**Tech Stack:** TypeScript (ESM, NodeNext-ish "Bundler" resolution), pnpm workspace app, `@cellstorm/sim` + `@cellstorm/score` (unchanged), `@cellstorm/renderer` (`renderBattle`/`encode` as a library), `@cellstorm/render` (`THEME` for scene colors), `@cellstorm/audio` (`pcmToWav` for silence), Playwright + esbuild + bundled `ffmpeg-static`.

---

## Guardrails honored (from the task spec + CLAUDE.md)

- **`packages/sim` and `packages/score` are NOT modified.** Reproducibility + Shorts A/B depend on byte-identical sim.
- **Determinism contract:** simulate in Node only; the tournament is a pure function of `(tournamentSeed, tuning knobs)`. Scenes animate off a tick counter, never wall-clock (CSS `@keyframes`/`transitions` would freeze in the wall-clock-decoupled renderer — drive inline styles per frame, exactly like `CssHud`).
- **One-way deps:** the new app depends on packages + the renderer app; nothing depends back on it.
- **Reuse, don't reimplement:** `runBattle`, `score`/`DEFAULT_PROFILE`, `renderBattle`, `encode`, `makePrng`/`randInt`/`shuffle`, `POWER_NAMES`, `THEME`, `pcmToWav`, bundled ffmpeg.

## The render-running constraint (sequencing)

A render is running concurrently, so this plan is split into two phases:

- **Phase A — buildable NOW (new files only):** scaffold `apps/tournament/` and write every source + test file. No existing file is touched. No battle/Playwright/ffmpeg execution (would compete with the live render), and no `pnpm install` (touches `pnpm-lock.yaml`).
- **Phase B — after the user's go-ahead:** wire into the 2 existing workspace files (`tsconfig.json` references, root `package.json` script), `pnpm install`, run the test suite, and produce the test tournament MP4.

> `pnpm-workspace.yaml` globs `apps/*`, so creating `apps/tournament/` makes it a workspace member without editing that file. Only the root `tsconfig.json` references list and the root `tournament` script need edits — both deferred to Phase B.

---

## The five design decisions (what the user asked to confirm)

### 1. Structure & imports
New app `apps/tournament` (name `@cellstorm/tournament`), mirroring `apps/renderer`'s setup. It imports:
- `@cellstorm/sim` — `runBattle`, `normalizeConfig`, `makePrng`, `randInt`, `shuffle`, `POWER_NAMES`.
- `@cellstorm/score` — `score`, `DEFAULT_PROFILE`.
- `@cellstorm/renderer` — `renderBattle`, `encode`, `MASTER_WIDTH`, `MASTER_HEIGHT`, `frameFileName` (its `index.ts` library surface; importing it does NOT run the renderer CLI).
- `@cellstorm/audio` — `pcmToWav` (Node-safe; pure).
- `@cellstorm/render` — `THEME`/`teamColor` imported **only inside the browser scene bundle** (the root index pulls pixi, which throws under Node; the scene bundle runs in Chromium where pixi is fine). Node passes scene *structure* only; the browser bundle maps slot→color.
- `playwright`, `esbuild`, `ffmpeg-static` directly.
- The sweep worker pool (`apps/cli`) is **NOT** reused — a direct `runBattle` loop is simpler, deterministic, DB-free, and ~1500 sims is well within budget. (Reuse remains possible later.)

### 2. Seed cascade (pure, in `src/seed.ts`)
One `tournamentSeed` → everything, via integer-salted derivations of `makePrng`:
- `deriveSeed(...parts) → uint32`: FNV-1a-style mix of the parts + one `makePrng` diffusion step. Stable, well-distributed, position-keyed (independent of iteration order).
- **16 entrants:** `shuffle(makePrng(deriveSeed(seed, SALT_POWERS)), [...POWER_NAMES]).slice(0, 16)`. The shuffle order IS the seeding (slot[i] = entrant i). Splitter stays in.
- **Bracket pairings:** adjacent slots — match `m` of a round = `(slot[2m] vs slot[2m+1])`, `powers[0]` = top slot, `powers[1]` = bottom slot (so top is always team0/Red, bottom team1/Blue — see color note).
- **Per-match sweep range:** `base = deriveSeed(seed, SALT_MATCH, round, matchIndex)`, seeds `base … base+seedsPerMatch-1`. Different & deterministic for every bracket position.
- **Finale sweep range:** `base = deriveSeed(seed, SALT_FINALE)`, seeds `base … base+finaleBudget-1`.

### 3. The two new scenes & format-identity guarantee
Bracket animation, podium, and the intro reveal are **tick-driven DOM/CSS** (crisp text/lines/boxes at 4K; animation = per-tick inline-style interpolation, no CSS transitions). They render through a generic `sceneCapture` that mirrors `renderBattle`'s loop: esbuild-bundle a `sceneEntry.ts` IIFE, launch Chromium at the SAME `renderWidth×renderHeight`, `__scene.drawFrame(tick)` + `page.screenshot` per frame → `%06d.png`.

**Format identity (the concat gotcha) is guaranteed structurally:** every segment — match clips AND scenes — is encoded by the SAME `encode()` from `@cellstorm/renderer` with the SAME `{ fps: 60, video: { crf } }` at the SAME `width` (and `--ss` supersample), producing identical `libx264 / yuv420p / -profile:v high / -crf 18` video. Scenes get a format-matched **silent AAC track**: `pcmToWav(new Float32Array(n), new Float32Array(n), 44100)` → `encode({ audioPath })` → `aac -b:a 192k`, exactly matching the match clips' synth track. So `ffmpeg -f concat -c copy` is lossless and A/V-aligned. The canonical `{width,height,renderWidth,renderHeight}` is computed once and fed to both battle and scene renders (same `even()`/aspect math as `renderBattle`).

**Color (recommendation):** *positional/slot* coloring — top competitor = team0 = Red, bottom = team1 = Blue, in EVERY match, matching the unmodified battle renderer; an advancing winner adopts the color of its slot in the next match. This needs no per-team theme override (renderBattle doesn't expose one) and keeps bracket beats visually identical to the battles. Trade-off: an entrant's color can flip as it advances. Fixed per-entrant colors (16-color palette + per-match theme override) is a future enhancement requiring a small renderer hook.

### 4. Disabling the cold open + HUD recommendation
- **Cold open:** call `renderBattle` as a **library** with `opening: { enabled: false }`. The option already exists in `RenderOptions`; the CLI just doesn't expose it, and the library path also returns `result.log` for audio. **No renderer change needed** (chosen over adding a CLI flag).
- **HUD (recommendation):** `hud: { ...DEFAULT_HUD, showIntro: false }`. The bracket beat immediately before each match already introduces the matchup, so the per-match intro scrim is redundant. Keep `showCounters`/`showLeaderboard` (the live top strip — viewers track who's who) and `showWinner` (the per-match climax card). All toggles tunable.

### 5. Finale triple search (`src/finale.ts`)
Sweep `finaleBudget` (default 300) seeds for the finalist pairing; record `{seed, winner∈{0,1}, drama, resolved}` for each.
- **Objective:** maximize `g1.drama.score + g2.drama.score + g3.drama.score` subject to: `g1`/`g2` are a 1-1 split (one win each between the two finalists) and `g3` is decisive.
- **Construction (optimal greedy for that objective):** best decisive win for finalist0 + best decisive win for finalist1 + best remaining decisive battle as `g3` (champion = `g3`'s winner). The two split games are ordered by ascending drama (build-up), `g3` is the climax.
- **Fallback** (a finalist has zero decisive wins in budget, e.g. total domination): the best honest best-of-three — top-3 decisive battles by drama, in order, champion = first to two wins.
- Drama comparison prefers `passed` gate, then higher `score`, then lower `seed` (stable). Pure given the swept results.

---

## File Structure

```
apps/tournament/
  package.json                  @cellstorm/tournament; deps sim/score/render/renderer/audio + ffmpeg-static/playwright; dev esbuild/tsx/@types/node
  tsconfig.json                 extends ../../tsconfig.base.json; references sim, score, render, ../renderer; include src,test
  src/
    types.ts                    Entrant, MatchResult, DecidedBracket, FinaleResult, TournamentResult, TournamentOptions, scene payloads
    seed.ts                     deriveSeed, SALT_*, selectEntrants  (PURE)
    bracket.ts                  buildInitialBracket, pairingsFor, advance winners → DecidedBracket shape  (PURE)
    drama.ts                    betterDrama() comparator shared by sim + finale  (PURE)
    simulateBracket.ts          Pass 1: per-pairing best-battle sweep (runBattle+score) → decided bracket
    finale.ts                   best-of-three triple search + fallback  (PURE given a battle-sampler fn)
    tournament.ts               orchestrate seed → entrants → simulateBracket → finale → TournamentResult (pure data)
    dims.ts                     canonical {width,height,renderWidth,renderHeight} from MASTER_*, scale, ss  (PURE)
    scene/
      sceneData.ts              build IntroData / BracketBeatData / PodiumData from TournamentResult  (PURE)
      bracketLayout.ts          pure x/y layout math for bracket slots (used by sceneEntry)  (PURE)
      sceneEntry.ts             BROWSER IIFE: window.__scene.init(payload,w,h)+drawFrame(tick); DOM/CSS draw; imports THEME
      sceneCapture.ts           NODE: esbuild-bundle sceneEntry, Playwright step+screenshot → frames; returns frameCount
    render/
      silentWav.ts              silentWavBytes(durationSec) = pcmToWav(zeros,zeros,44100)  (PURE)
      renderMatch.ts            renderBattle({opening:{enabled:false},hud:{showIntro:false}}) + audio + encode → clip mp4
      renderScene.ts            sceneCapture + silentWav + encode → scene mp4
    assemble.ts                 concatListContent() (PURE) + concatSegments() (spawns ffmpeg -f concat -c copy)
    pacing.ts                   SCENE_DURATIONS + DEFAULT_TOURNAMENT_OPTIONS constants (all tunable)  (PURE)
    pipeline.ts                 Pass 2: TournamentResult → ordered segment renders → assemble → final mp4
    cli.ts                      parseTournamentArgs + main(): seed→tournament→pipeline→one MP4
    index.ts                    library surface (runTournament, renderTournament, types)
  test/
    seed.test.ts                deriveSeed determinism/distribution; selectEntrants = 16 distinct, seed-stable
    bracket.test.ts             16→8→4→2→1 structure; winner advancement; powers[0]=top slot
    drama.test.ts               betterDrama ordering (passed > score > seed)
    finale.test.ts              prefers 1-1-into-g3 maximizing drama; fallback to honest bo3; champion correctness
    dims.test.ts                even dims, 9:16 aspect, supersample math == renderBattle
    sceneData.test.ts           payload builders (entrant count, advancement slots, podium top-2)
    bracketLayout.test.ts       slot positions monotonic per round, no overlap
    silentWav.test.ts           44-byte WAV header, 44100/16/stereo, N samples = ceil(sec*44100)
    assemble.test.ts            concat list format + single-quote escaping
    tournament.test.ts          INTEGRATION (tiny seedsPerMatch/budget): same seed → identical TournamentResult; new seed differs
```

---

## Phase A — Tasks (buildable now, new files only)

> TDD where the unit is pure. The Playwright/ffmpeg/renderBattle modules are integration-only and are exercised by the Phase-B smoke render; for those, the task writes the module + a pure-helper test (arg/structure builders) and defers execution.

### Task 1: Scaffold the workspace app

**Files:**
- Create: `apps/tournament/package.json`
- Create: `apps/tournament/tsconfig.json`

- [ ] **Step 1: Write `package.json`** (mirror `apps/renderer`)

```json
{
  "name": "@cellstorm/tournament",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "start": "tsx src/cli.ts" },
  "dependencies": {
    "@cellstorm/audio": "workspace:*",
    "@cellstorm/render": "workspace:*",
    "@cellstorm/renderer": "workspace:*",
    "@cellstorm/score": "workspace:*",
    "@cellstorm/sim": "workspace:*",
    "ffmpeg-static": "^5.2.0",
    "pixi.js": "^8.0.0",
    "playwright": "^1.48.0"
  },
  "devDependencies": { "esbuild": "^0.24.0", "tsx": "^4.19.0" }
}
```
(`pixi.js` is a dep only because the esbuild scene bundle resolves `@cellstorm/render`'s root export graph; the scene itself uses DOM/CSS.)

- [ ] **Step 2: Write `tsconfig.json`** (mirror `apps/renderer`, add DOM libs for the scene entry)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "outDir": "./dist", "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": ["node"] },
  "references": [
    { "path": "../../packages/sim" },
    { "path": "../../packages/score" },
    { "path": "../../packages/render" },
    { "path": "../renderer" }
  ],
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Commit** `feat(tournament): scaffold @cellstorm/tournament workspace app`

### Task 2: Shared types (`src/types.ts`)

**Files:** Create `apps/tournament/src/types.ts`

- [ ] **Step 1: Write the types** (no test; consumed by every later task)

```ts
import type { BattleSummary } from "@cellstorm/sim";
import type { DramaReport } from "@cellstorm/score";

export type Entrant = string;            // a power name from POWER_NAMES
export type Round = "ro16" | "qf" | "sf" | "final";

export interface ChosenBattle {           // a single decided battle within a match
  seed: number;
  powers: [Entrant, Entrant];             // [top=team0, bottom=team1]
  winnerTeam: 0 | 1;
  winner: Entrant;
  drama: DramaReport;
  summary: BattleSummary;
}

export interface MatchResult extends ChosenBattle {
  round: Round;
  matchIndex: number;                     // position within the round (0-based)
}

export interface DecidedBracket {
  entrants: Entrant[];                    // 16, in seeded slot order
  rounds: { ro16: MatchResult[]; qf: MatchResult[]; sf: MatchResult[] };
  finalists: [Entrant, Entrant];          // [top, bottom] of the final
}

export interface FinaleResult {
  kind: "tiebreak" | "honest";
  finalists: [Entrant, Entrant];
  games: ChosenBattle[];                  // 2..3 games, in play order
  champion: Entrant;
  runnerUp: Entrant;
}

export interface TournamentResult {
  seed: number;
  options: TournamentOptions;
  bracket: DecidedBracket;
  finale: FinaleResult;
  champion: Entrant;
}

export interface TournamentOptions {
  seedsPerMatch: number;                  // default 100
  finaleBudget: number;                   // default 300
  scale: number;                          // default 1 (fraction of 2160 master)
  supersample: number;                    // default 1
  crf: number;                            // default 18
  fps: number;                            // default 60
}
```

- [ ] **Step 2: Commit** `feat(tournament): shared result/option types`

### Task 3: Seed cascade (`src/seed.ts`) — TDD

**Files:** Create `apps/tournament/src/seed.ts`, `apps/tournament/test/seed.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { deriveSeed, selectEntrants, SALT_MATCH } from "../src/seed";

describe("deriveSeed", () => {
  it("is deterministic and order/position sensitive", () => {
    expect(deriveSeed(7, SALT_MATCH, 0, 0)).toBe(deriveSeed(7, SALT_MATCH, 0, 0));
    expect(deriveSeed(7, SALT_MATCH, 0, 0)).not.toBe(deriveSeed(7, SALT_MATCH, 0, 1));
    expect(deriveSeed(7, SALT_MATCH, 0, 0)).not.toBe(deriveSeed(8, SALT_MATCH, 0, 0));
  });
  it("returns a uint32", () => {
    const s = deriveSeed(123, 4, 5);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });
});

describe("selectEntrants", () => {
  it("picks 16 distinct powers, stable per seed, varying across seeds", () => {
    const a = selectEntrants(42), b = selectEntrants(42), c = selectEntrants(43);
    expect(a).toHaveLength(16);
    expect(new Set(a).size).toBe(16);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
```

- [ ] **Step 2: Run, expect fail** — `pnpm vitest run apps/tournament/test/seed.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import { makePrng, shuffle, POWER_NAMES } from "@cellstorm/sim";

export const SALT_POWERS = 1, SALT_SEEDING = 2, SALT_MATCH = 3, SALT_FINALE = 4;

export function deriveSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) { h ^= p | 0; h = Math.imul(h, 0x01000193); h ^= h >>> 15; }
  return Math.floor(makePrng(h >>> 0)() * 0x1_0000_0000) >>> 0;
}

export function selectEntrants(tournamentSeed: number): string[] {
  const prng = makePrng(deriveSeed(tournamentSeed, SALT_POWERS));
  return shuffle(prng, [...POWER_NAMES]).slice(0, 16);
}
```

- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** `feat(tournament): deterministic seed cascade + entrant selection`

### Task 4: Bracket model (`src/bracket.ts`) — TDD

**Files:** Create `apps/tournament/src/bracket.ts`, `apps/tournament/test/bracket.test.ts`

- [ ] **Step 1: Failing test** — assert `pairingsFor(16)` yields 8 pairs of adjacent slot indices `[[0,1],[2,3],…,[14,15]]`; `nextRound(["A","B","C","D"... winners])` halves the field; `powers[0]` corresponds to the lower slot index.

```ts
import { describe, it, expect } from "vitest";
import { pairingsFor, nextRoundEntrants } from "../src/bracket";

describe("bracket", () => {
  it("pairs adjacent slots", () => {
    expect(pairingsFor(16)).toEqual([[0,1],[2,3],[4,5],[6,7],[8,9],[10,11],[12,13],[14,15]]);
  });
  it("advances winners into the next round in order", () => {
    expect(nextRoundEntrants(["A","B","C","D"])).toEqual([["A","B"],["C","D"]]);
  });
});
```

- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** `pairingsFor(n)` → adjacent index pairs; `nextRoundEntrants(winners)` → adjacent pairs of the winners list (the next round's matchups). Pure.
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** `feat(tournament): pure bracket pairing/advancement`

### Task 5: Drama comparator (`src/drama.ts`) — TDD

**Files:** Create `apps/tournament/src/drama.ts`, `apps/tournament/test/drama.test.ts`

- [ ] **Step 1: Failing test** — `betterDrama(a,b)` true when `a.passed && !b.passed`; when both passed, higher `score` wins; equal → false (stable, keep incumbent).
- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement**

```ts
import type { DramaReport } from "@cellstorm/score";
/** True if candidate strictly beats incumbent: passed-gate first, then higher score. Ties → false. */
export function betterDrama(cand: DramaReport, inc: DramaReport): boolean {
  if (cand.passed !== inc.passed) return cand.passed;
  return cand.score > inc.score;
}
```

- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** `feat(tournament): drama comparator (passed > score)`

### Task 6: dims (`src/dims.ts`) — TDD

**Files:** Create `apps/tournament/src/dims.ts`, `apps/tournament/test/dims.test.ts`

- [ ] **Step 1: Failing test** — `canonicalDims({scale:1,ss:1})` → `{width:2160,height:3840,renderWidth:2160,renderHeight:3840}`; `scale:0.5` → 1080×1920; all even; `ss:2` doubles render dims; aspect preserved.
- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** using `MASTER_WIDTH`/`MASTER_HEIGHT` from `@cellstorm/renderer` and the same `even()`/aspect formula as `renderBattle` so battle and scene dims are bit-identical.

```ts
import { MASTER_WIDTH, MASTER_HEIGHT } from "@cellstorm/renderer";
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
export function canonicalDims(o: { scale: number; supersample: number }) {
  const width = even(MASTER_WIDTH * o.scale);
  const height = even((width * MASTER_HEIGHT) / MASTER_WIDTH);
  const renderWidth = even(width * (o.supersample > 0 ? o.supersample : 1));
  const renderHeight = even((renderWidth * MASTER_HEIGHT) / MASTER_WIDTH);
  return { width, height, renderWidth, renderHeight };
}
```

- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** `feat(tournament): canonical render dimensions matching renderBattle`

### Task 7: Finale search (`src/finale.ts`) — TDD

**Files:** Create `apps/tournament/src/finale.ts`, `apps/tournament/test/finale.test.ts`

The selector is pure: it takes an array of sampled finale battles `{seed,winnerTeam,drama,resolved}` (the I/O sweep lives in `simulateBracket.ts`/`tournament.ts`) and the two finalists, and returns a `FinaleResult`.

- [ ] **Step 1: Failing test** — feed synthetic battles where both finalists have decisive wins; assert `kind==="tiebreak"`, 3 games, `games[0].drama.score <= games[1].drama.score`, `champion === finale.games[2] winner`, and combined drama is the max achievable. Then feed battles where only finalist0 ever wins; assert `kind==="honest"`, champion = finalist0, 3 games in drama order.
- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** `selectFinale(finalists, sampled)` per design decision #5 (best-win-each + best-remaining → tiebreak; else top-3 by drama + first-to-two). Tie-breaks by lower seed. `runnerUp` = the finalist who isn't champion.
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** `feat(tournament): best-of-three finale selection with tiebreaker + fallback`

### Task 8: Pass-1 simulation (`src/simulateBracket.ts`) + tournament orchestrator (`src/tournament.ts`)

**Files:** Create `apps/tournament/src/simulateBracket.ts`, `apps/tournament/src/tournament.ts`, `apps/tournament/test/tournament.test.ts`

- [ ] **Step 1: Implement `bestBattleForPairing(A,B,baseSeed,n)`** — loop `runBattle(normalizeConfig({seed, teamCount:2, powers:[A,B]}))`, `score(log, DEFAULT_PROFILE)`, keep the `betterDrama` winner; return `ChosenBattle` (`winner = winnerTeam===0?A:B`).
- [ ] **Step 2: Implement `simulateBracket(entrants, seed, opts)`** — run ro16 (8) → qf (4) → sf (2) using `pairingsFor`/`nextRoundEntrants`, `base = deriveSeed(seed, SALT_MATCH, roundIdx, matchIdx)`; return `DecidedBracket`.
- [ ] **Step 3: Implement `sampleFinale(finalists, seed, budget)`** — sweep `deriveSeed(seed, SALT_FINALE)+i`; hand results to `selectFinale`.
- [ ] **Step 4: Implement `runTournament(seed, partialOpts?) → TournamentResult`** in `tournament.ts` (pure data; no rendering).
- [ ] **Step 5: Integration test** (`tournament.test.ts`) with tiny knobs (`seedsPerMatch:3, finaleBudget:6`): same seed → deep-equal `TournamentResult`; different seed → different champion or bracket. (Runs real `runBattle` but tiny; fast.)
- [ ] **Step 6: Run, expect pass.**
- [ ] **Step 7: Commit** `feat(tournament): pass-1 bracket simulation + pure tournament result`

### Task 9: Scene payloads (`src/scene/sceneData.ts`) + layout (`src/scene/bracketLayout.ts`) — TDD

**Files:** Create `apps/tournament/src/scene/sceneData.ts`, `apps/tournament/src/scene/bracketLayout.ts`, `apps/tournament/test/sceneData.test.ts`, `apps/tournament/test/bracketLayout.test.ts`

- [ ] **Step 1: Failing tests** — `buildIntroData(result)` → 16 entrants + ro16 matchups; `buildBracketBeats(result)` → one beat per match carrying `{ revealedMatchKey, winnerSlotInNextRound, fullBracketState }`; `buildPodiumData(result)` → `{champion, runnerUp, third?}`. `bracketLayout(round)` → slot rectangles with monotonic, non-overlapping y per round.
- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** the pure builders + layout math. Scene payloads are plain JSON (no colors — the browser bundle maps slot→`THEME` color). Third place: derive as the higher-drama of the two SF losers, or omit (tunable flag `includeThird`, default true).
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** `feat(tournament): scene payload + bracket layout builders`

### Task 10: Silent WAV (`src/render/silentWav.ts`) — TDD

**Files:** Create `apps/tournament/src/render/silentWav.ts`, `apps/tournament/test/silentWav.test.ts`

- [ ] **Step 1: Failing test** — `silentWavBytes(1)` returns bytes starting `RIFF…WAVE`, header declares 2ch / 44100 / 16-bit, and length = 44 + ceil(1*44100)*4.
- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement**

```ts
import { pcmToWav } from "@cellstorm/audio";
export function silentWavBytes(durationSec: number, sampleRate = 44100): Uint8Array {
  const n = Math.max(1, Math.ceil(durationSec * sampleRate));
  return pcmToWav(new Float32Array(n), new Float32Array(n), sampleRate);
}
```

- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** `feat(tournament): format-matched silent audio track`

### Task 11: Assembly arg builder (`src/assemble.ts`) — TDD (concat fn deferred to Phase B run)

**Files:** Create `apps/tournament/src/assemble.ts`, `apps/tournament/test/assemble.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { concatListContent } from "../src/assemble";
it("formats a concat demuxer list and escapes single quotes", () => {
  expect(concatListContent(["/a/01.mp4", "/b/it's.mp4"]))
    .toBe("file '/a/01.mp4'\nfile '/b/it'\\''s.mp4'\n");
});
```

- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** `concatListContent(paths)` (pure) and `concatSegments(paths, outPath, ffmpegPath?)` spawning `ffmpeg -y -f concat -safe 0 -i <list> -c copy <out>`. Resolve the binary via `ffmpeg-static` (fallback `"ffmpeg"`).
- [ ] **Step 4: Run, expect pass** (only the pure test runs now).
- [ ] **Step 5: Commit** `feat(tournament): ffmpeg concat-demuxer assembly (-c copy)`

### Task 12: Browser scene entry (`src/scene/sceneEntry.ts`) + capture (`src/scene/sceneCapture.ts`)

**Files:** Create both. Integration-only (Playwright/esbuild); validated by the Phase-B smoke render.

- [ ] **Step 1: Implement `sceneEntry.ts`** — browser IIFE exposing `window.__scene = { init(payload, w, h), drawFrame(tick), frameCount() }`. Builds the DOM (intro / bracket-beat / podium variants chosen by `payload.kind`), styles via `THEME` (slot0=Red, slot1=Blue, podium gold/silver/bronze). `drawFrame(tick)` sets inline styles (opacity/transform/position) interpolated from `tick/total` — NO CSS transitions. Mirror `renderBattle`'s `PAGE_HTML` wrapper (`line-height:0`, full-bleed root).
- [ ] **Step 2: Implement `sceneCapture.ts`** — `bundleSceneScript()` via esbuild (`format:"iife"`, `platform:"browser"`, like `bundlePageScript`); `captureScene(payload, dims, frames, framesDir)` launches Chromium at `renderWidth×renderHeight`, injects the bundle, `await document.fonts.ready`, loops `__scene.drawFrame(t)` + `page.screenshot(frameFileName(t))`. Returns frame count.
- [ ] **Step 3: Commit** `feat(tournament): tick-driven DOM/CSS scene renderer (bracket/podium/intro)`

### Task 13: Segment renderers (`src/render/renderMatch.ts`, `src/render/renderScene.ts`) + pacing

**Files:** Create `apps/tournament/src/render/renderMatch.ts`, `apps/tournament/src/render/renderScene.ts`, `apps/tournament/src/pacing.ts`. Integration-only.

- [ ] **Step 1: Implement `pacing.ts`** — `DEFAULT_TOURNAMENT_OPTIONS` and `SCENE_DURATIONS = { intro:5, beatRo16:2.0, beatQf:2.5, beatSf:3.5, finaleScore:2.5, champion:4.0, podium:7.0 }` (all tunable).
- [ ] **Step 2: Implement `renderMatch(chosen, dims, opts, outPath)`**:

```ts
const result = await renderBattle({
  config: normalizeConfig({ seed: chosen.seed, teamCount: 2, powers: chosen.powers }),
  hud: { ...DEFAULT_HUD, showIntro: false },
  framesDir, width: dims.width, supersample: opts.supersample,
  opening: { enabled: false },
});
writeFileSync(join(framesDir, "audio.wav"), renderBattleAudioWav(result.log, opts.fps));
await encode({ framesDir, outPath, fps: opts.fps, audioPath, audioOffsetSec: 0,
  video: { crf: opts.crf, ...(result.renderWidth !== result.width ? { scaleW: result.width, scaleH: result.height } : {}) } });
```

- [ ] **Step 3: Implement `renderScene(payload, durationSec, dims, opts, outPath)`** — `frames = round(durationSec*opts.fps)`; `captureScene(...)`; `audio.wav = silentWavBytes(frames/opts.fps)`; `encode({ ..., video:{ crf, scale if ss } })` — SAME video opts as `renderMatch`.
- [ ] **Step 4: Commit** `feat(tournament): match + scene segment renderers (identical encode params)`

### Task 14: Pipeline (`src/pipeline.ts`) + CLI (`src/cli.ts`) + index

**Files:** Create `apps/tournament/src/pipeline.ts`, `apps/tournament/src/cli.ts`, `apps/tournament/src/index.ts`. Integration-only.

- [ ] **Step 1: Implement `renderTournament(result, opts, outPath, workDir)`** — build the ordered segment list: `[intro]`, then ro16/qf/sf each as `[matchClip, bracketBeat]…`, then finale `[g1, scoreBeat, g2, scoreBeat, g3]`, then `[championBeat, podium]`. Render each to `workDir/<index>.mp4` (zero-padded), then `concatSegments(orderedPaths, outPath)`. `--keep` retains `workDir`.
- [ ] **Step 2: Implement `cli.ts`** — `parseArgs`: `--seed` (req), `--out` (req), `--seeds-per-match`, `--finale-budget`, `--scale`, `--ss`, `--crf`, `--keep`, plus scene-duration overrides; `main()` = `runTournament(seed, opts)` → `renderTournament(...)`; same direct-invocation guard as `renderer/src/cli.ts` (`pathToFileURL`). One command, one MP4.
- [ ] **Step 3: Implement `index.ts`** — export `runTournament`, `renderTournament`, types.
- [ ] **Step 4: Commit** `feat(tournament): end-to-end pipeline + one-command CLI`

---

## Phase B — Tasks (after the user's go-ahead; touches 2 existing files + executes)

### Task 15: Wire into the workspace
- [ ] Add `{ "path": "./apps/tournament" }` to root `tsconfig.json` `references`.
- [ ] Add `"tournament": "pnpm --filter @cellstorm/tournament start"` to root `package.json` scripts.
- [ ] (Optional DRY-up) Re-export `resolveFfmpegBin` from `apps/renderer/src/index.ts` and import it in `assemble.ts` instead of the local resolver.
- [ ] `pnpm install` (links the new workspace deps).
- [ ] Commit `chore(tournament): wire app into workspace`

### Task 16: Verify
- [ ] `pnpm typecheck` exits 0 (CLAUDE.md gotcha — confirm output).
- [ ] `pnpm test` green (new pure + integration tests).
- [ ] Produce the test MP4: `pnpm tournament --seed 1 --out /tmp/tournament-seed1.mp4` (consider a quick low-cost pass first: `--scale 0.25 --seeds-per-match 20 --finale-budget 40` to validate concat/sync/scenes fast, then a full `--scale 1` run).
- [ ] **Concat sanity:** `ffprobe` each segment + final — confirm uniform `2160x3840 / 60fps / h264 high / yuv420p / aac 44100 stereo`, monotonic timestamps, no A/V desync at segment seams. If `-c copy` shows audio gaps, switch `concatSegments` to the concat *filter* (re-encode) — documented fallback.
- [ ] Watch the full MP4 end-to-end: intro → bracket beats advancing correct winners in slot colors → match clips (no cold open, no intro scrim, live strip + winner card present, synth SFX) → 1-1 finale into game 3 → champion beat → podium.

---

## Self-Review (against the acceptance criteria)

- One command → one concatenated MP4, no manual editing — **Task 14 CLI + Task 15 script + Task 16**.
- `tournamentSeed` fully determines the tournament (+ tuning knobs are part of the recipe) — **Tasks 3, 8; tournament.test.ts deep-equal**.
- Pass 1 fully simulates the bracket before any rendering — **Task 8 produces `TournamentResult`; Task 14 renders only from it**.
- Each match = highest-drama of N swept seeds, winner of that battle advances — **Tasks 5, 8 (`betterDrama`, `bestBattleForPairing`)**.
- Finale prefers 1-1-into-g3 tiebreaker, else honest bo3 — **Task 7 + finale.test.ts**.
- Match clips: 4K60, synth SFX, cold open disabled — **Task 13 `renderMatch` (`opening:{enabled:false}`, audio kept)**.
- Bracket + podium are renderer-stack scenes in IDENTICAL format → clean concat — **Tasks 6, 10, 12, 13 (shared `dims` + `encode` + silent AAC); Task 16 ffprobe**.
- No music; synth SFX only — **`renderMatch` passes no `music`; scenes silent**.
- `packages/sim` + `packages/score` unchanged — **no task modifies them**.
- Everything tunable — **`pacing.ts` + CLI flags (Tasks 13, 14)**.

**Open verification items (Phase B):** confirm `-c copy` concat stays A/V-aligned across ~30 segments (fallback documented); confirm `@cellstorm/render` root import resolves cleanly inside the esbuild browser bundle (it does for `apps/renderer`'s `page-entry`).

---

## Build results / deviations (2026-05-28, Phase B)

Implemented and verified on a 720p test render (seed 1): full pipeline runs, 36 segments concat into one MP4, streams uniform (`720x1280 / h264 High / yuv420p / 60fps / aac 44100 stereo`).

- **Concat audio:** `-c copy` did NOT stay clean — per-segment AAC encoder priming produced repeated "Non-monotonous DTS in output stream 0:1" (audio) at every seam. Shipped fix: copy video losslessly, **re-encode audio only** — `ffmpeg -f concat -safe 0 -i list -c:v copy -c:a aac -b:a 192k out` (in `assemble.ts`). Verified: zero DTS warnings, video bytes unchanged. (Video `-c copy` was always clean.)
- **Scene colors:** added a pure `src/colors.ts` (a hand-kept copy of `THEME.teams[].color`) instead of importing `@cellstorm/render` in the browser bundle — avoids esbuild pulling pixi into the scene IIFE. Resolved the "does the render root import bundle cleanly" question by sidestepping it.
- **Segment ordering:** pulled into a pure, unit-tested `src/segments.ts` (`planSegments`).
- **`--max-match-frames`:** added a TEST-ONLY CLI flag (+ `RenderTournamentOptions.maxMatchFrames`) to cap match-clip length for fast low-cost test renders; full renders omit it.
- **Performance note:** each full 1v1 sim ≈ 0.6s, so **pass 1 at default budgets (≈1700 sims) ≈ 15–20 min** before any rendering. Test renders should use reduced `--seeds-per-match` / `--finale-budget`. 4K-60 final render is ~10+ hrs (per-frame Playwright screenshots are the bottleneck).
- **Verified:** `tsc -b` exit 0; 33/33 tests pass; integration test trimmed from 5 full tournaments to 3 shared runs.
