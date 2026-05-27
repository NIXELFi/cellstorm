# Cellstorm — Design Spec

**Date:** 2026-05-27
**Status:** Approved design, pre-implementation
**Audience:** Internal only (just the two of us)

## Purpose

Cellstorm is internal software that produces entertaining YouTube Shorts of "cellular
battle royale" simulations — N teams of cells, each team with one of 20 special powers,
last team standing wins. It is the production tooling around the `battle.html` prototype
concept (see `README.md`).

The core bet: **the simulation stays honest, and entertainment is bought through volume.**
We run thousands of deterministic seeds, score each on a "drama curve," keep only the
top ~1%, and render those at 4K60. No drama is engineered into the sim — we find the best
drama by brute-force search and ruthless filtering. This is how professional creators in
the niche operate: they don't fake drama, they curate.

The day-to-day workflow lives in a **harness** where we preview ranked battles, watch sims,
and tune visuals/balance/scoring together. A final 4K render is a first-class pipeline stage
but a *lower* priority than the harness — it matters once look + audio are dialed in.

## Goals

- Deterministic sim: `seed + config → identical battle`, every time, on this machine.
- Headless batch scoring that ranks battles by an editable "drama" model.
- A harness to author sweeps, browse ranked candidates, replay them, and tune everything live.
- Durable storage so closing/reopening the harness loses nothing; render from any past result.
- Multi-hour "sweep everything" runs that are resumable and trivially stoppable.
- A shared renderer so the harness preview is byte-for-byte the final render at lower res (WYSIWYG).
- 4K60 finished-video render (designed in now, prioritized after look + audio).

## Non-Goals (v1)

- Audio / music-sync layer — phase 2 (the architecture carries the event log it will need).
- YouTube upload automation, thumbnails, metadata templating.
- Arena modes beyond the default open arena (designed as a sweepable axis, content later).
- RL-trained agents (the README "moonshot").
- Cross-machine determinism (single-machine internal use; JS doubles are deterministic per platform).

## Key Decisions (locked during brainstorming)

- **Stack:** TypeScript end to end. PixiJS/WebGL for visuals (glow/bloom/particles iterate
  live in-browser and look premium). Vite for the harness. Node for batch/lab. Playwright +
  ffmpeg for 4K60 capture. One language across sim, scoring, harness UI, and renderer — no
  port, no FFI seam. Rust/WASM rejected as overkill for single-machine internal use.
- **Determinism via seeded PRNG**, not `Math.random()`. Fixed timestep, no wall-clock reads.
- **Pure sim + ruthless filter**, never outcome tampering. The only pre-sim nudging allowed is
  matchup selection (skip known-stalemate combos).
- **One shared deterministic sim core, three runtimes** (scorer / harness / renderer). Rejected
  alternatives: separate fast+rich sims (divergence is fatal to score-then-render), and
  record-and-replay (full-state replay is as costly as re-simming a deterministic sim).
- **The HTML prototype is a behavioral reference, not a code template** — we improve structure
  and robustness freely while preserving the *feel*.

## Architecture

### Approach: one shared deterministic core, three runtimes

A single pure-logic sim engine, consumed by three thin shells:

- **Scorer** (Node): runs the core headless, no rendering, emits an event log → thousands of
  seeds/minute.
- **Harness** (browser): core + renderer + HUD compositor, real-time playback + controls.
- **Renderer** (headless browser via Playwright): same core + same renderer + same compositor,
  stepped frame-by-frame, canvas captured each frame → ffmpeg → 4K60 MP4.

One sim and one compositor means the scorer cannot disagree with the video, and the harness
preview cannot drift from the final render.

### Repository layout

```
cellstorm/
  packages/
    sim/            # @cellstorm/sim — pure deterministic engine, zero DOM/render deps
      powers.ts     #   the 20 powers as data (behavior ported from battle.html)
      prng.ts       #   seeded mulberry32 PRNG (gameplay stream)
      world.ts      #   cell/projectile/particle state + spatial hash
      ai.ts         #   the 4-state machine
      systems/      #   movement, abilities, collision, spawn — separate passes over the world
      step.ts       #   one fixed-timestep tick → mutates world, returns events
      events.ts     #   event log types
      config.ts     #   BattleConfig + tunable constants
      index.ts
    render/         # @cellstorm/render — PixiJS scene + shared HUD compositor
      scene.ts      #   draws world state (cells, projectiles, particles, FX)
      hud/          #   compositor: counters, leaderboard, intro, winner — config-driven
      theme.ts      #   colors/background ported from prototype (baseline)
    score/          # @cellstorm/score — event log → DramaReport
      metrics.ts    #   gates + weighted components
      index.ts
  apps/
    harness/        # Vite browser app: sweep builder, ranked grid, player, HUD editor, tuning
    cli/            # Node: long-running headless sweep runner (sim+score, no render)
    renderer/       # Playwright + ffmpeg: BattleConfig → 4K60 MP4
    lab/            # Node: dev experimentation workbench (headless, parallel)
  docs/superpowers/specs/
```

Dependencies point one way: `sim` depends on nothing; `render` and `score` depend on `sim`;
apps depend on packages. `sim` stays trivially testable and cannot accidentally couple to render.

## Components

### 1. Sim core (`@cellstorm/sim`)

Faithful port of `battle.html` mechanics (spatial hash, staggered 4-state AI, the 20 powers,
collision/damage, magnet/sniper/charger/necromancer/lifebloom) with disciplined improvements:

- **Seeded PRNG everywhere.** Every prototype `Math.random()` (init spawn, AI wander, clone
  jitter, splitter roll) uses a single gameplay `prng()` seeded from `config.seed`. PRNG state
  is part of deterministic world state.
- **Two RNG streams.** A *gameplay* stream (only thing affecting outcomes) lives in the core; a
  separate *cosmetic* stream is owned by the renderer for visual jitter. Tweaking visuals can
  never change which seeds score well.
- **Fixed timestep, wall-clock-free.** `step()` advances exactly one tick of fixed dt; nothing
  reads `Date.now()`/rAF timing. Harness steps on rAF, scorer in a tight loop, renderer once per
  output frame — same function, same result.
- **`step()` returns an event list** (deaths w/ position+team+killer, kills, explosions,
  projectile fires, per-tick team counts, lead changes, battleEnd). Caller decides usage.
- **AI scheduling decoupled from array index.** Each cell gets a stable `id` and an `aiPhase`
  assigned at spawn from the gameplay PRNG; it decides when `frameCount % 8 === aiPhase`.
  Deterministic, evenly distributed, index-independent (replaces the prototype's
  `(frameCount + i) % 8`).
- **Compact dead cells.** Stable ids + index-independent scheduling let us swap-remove dead
  cells so hot loops only touch live ones.
- **Hard tick cap + stalemate detector.** A headless sim must always terminate; a max-tick limit
  and "no meaningful change for N ticks" signal end deadlocks (e.g. Necro+Lifebloom+Regen) and
  mark them as stalemates for scoring.
- **Light systems split** (movement / abilities / collision / spawn) instead of one mega-`step()`,
  for readability and easy extension. Not a full ECS.
- All tunable constants (HP/damage base, scan radius, team count, arena size, dt, caps) live in
  `config.ts` so they are sweepable/tweakable.

Behavior should still *feel* like the prototype; balance and game-feel get tuned live in the harness/lab.

### 2. Event log & scoring (`@cellstorm/score`)

The scorer accumulates `step()` events into a compact per-battle log plus a per-tick
`teamCounts[]` timeline. This single artifact feeds scoring, the harness drama-curve sparkline,
and (phase 2) audio sync.

`score(log) → DramaReport { passed, score, breakdown }`:

**Hard gates (fail → discarded, never shown):**
- Exactly one team alive at end (no timeout draw, no mutual extinction).
- Resolution time within configurable target window (default 30–60s of playback).
- No dead-air stalemate stretch beyond a threshold.

**Weighted components (0–1 each, summed):**
- **Lead volatility** — how often the front-runner changes (blowouts score low).
- **Comeback** — was the eventual winner ever near-death / clearly losing, then recovered.
- **Climax timing** — decisive kills clustered in the final ~20%.
- **Close finish** — winner ends with few survivors.
- **Sustained chaos** — deaths spread across the timeline, not front-loaded.

All gate thresholds and component weights live in a `ScoreProfile` config, editable in the
harness. Because scoring reads saved logs, **re-ranking under a new profile never re-simulates.**

### 3. Sweep / batch engine (`apps/cli`)

One parameterized spec drives everything (maximum compatibility — every axis sweepable):

```ts
SweepSpec {
  teamCount:    number | number[] | 'random'   // pin or sweep
  powers:       PowerAssignment                 // per slot: fixed | from-pool | random
  seeds:        { from: number, to: number } | number[]
  arena?:       ArenaParams                      // sweepable (content later)
  scoreProfile: ScoreProfile
  limit?:       number                           // cap total runs
}
```

The engine expands the spec into the cartesian product of non-fixed axes (capped by `limit`),
runs each `BattleConfig` through headless sim+score, and persists results. Directed mode = pin
powers + teamCount, sweep seeds. "Surprise me" = powers/teamCount `random`, sweep seeds. Same
engine, both fall out of how the spec is filled. Parallelized across `worker_threads`.

### 4. Persistence & long-running sweeps

**Insight:** determinism makes `BattleConfig` a complete, tiny recipe — seed + teamCount +
powers + arena reproduces the battle, its log, and its 4K render bit-for-bit, any time. So heavy
data never *needs* storing to keep a result renderable. This makes "sweep everything" storage-cheap.

**Storage (on disk, survives harness restarts):**
- **Results index in SQLite (`better-sqlite3`)** — one row per battle:
  `{configId, config, score, breakdown, winner, durationTicks, batchId}`. Sorts/pages through
  millions of rows instantly; this is the catalog the harness loads on startup.
- **Cached event logs for top-N candidates only** — compressed, keyed by `configId`, for instant
  drama-curve browsing. Below the cutoff we store only the small numeric report; opening such a
  candidate re-derives its log by re-simming from config. Bounded storage at any scale.

**Long-running sweep job:**
- Runs as a **background Node process** (the CLI app), independent of the harness — launch it,
  close the harness, return hours later; the harness reads the shared SQLite DB.
- **Incremental + resumable.** A job manifest records the `SweepSpec` and enumeration cursor;
  results flush continuously. Crash/stop loses at most the last few in-flight battles; restart
  resumes from the cursor.
- **Easy stop.** Graceful on `SIGINT` and on a stop flag the harness "Stop sweep" button sets —
  the job polls it, finishes the current batch, flushes, exits clean. No corruption.
- **Progress** (done/total, elapsed, current best, throughput) visible in the harness.

### 5. Harness (`apps/harness`) — where we live

Vite browser app: a player plus side panels.
- **Sweep builder** — author/launch a `SweepSpec` (pin/sweep each axis) or load a saved batch.
- **Ranked candidate grid** — sorted by drama score; each card shows matchup (team colors + power
  names), score, winner, and a population-over-time sparkline. Re-sorts instantly on `ScoreProfile`
  edits.
- **Player** — click a candidate → deterministic replay of that exact `BattleConfig` using the
  real sim + real renderer + real HUD. Play/pause, scrub, step, speed, "jump to climax" via the
  event log.
- **HUD editor** — toggle each broadcast element; edit content (e.g. intro title). Live in player.
- **Visual/balance tuning panel** — live sliders for theme + sim constants.
- **Send to render** — hands selected `BattleConfig` + HUD/theme config to the renderer.

Guarantee: the player uses the **same `render` package** as the 4K renderer, so the preview *is*
the render at lower resolution. WYSIWYG by construction.

### 6. Renderer & shared compositor (`@cellstorm/render` + `apps/renderer`)

One render library, two consumers (harness player + final renderer):
- **Scene layer (PixiJS/WebGL)** — cells (color by team, size by HP; current clean baseline),
  projectiles, particles, and a growing FX hook (glow/bloom, charger trails, plague clouds, death
  bursts, screen-shake). FX use only the cosmetic RNG stream.
- **HUD compositor** — config-driven broadcast layer, each element toggleable/editable:
  - Live animated team counters.
  - Dynamic leaderboard (live reorder by count, with power name + color).
  - Intro hook sequence (editable title + flash-forward-to-climax cut sourced from event log).
  - Winner reveal.
  Rendered as a scene-graph overlay so it composites identically at any resolution.
- **Theme** — colors/background ported from prototype as baseline, exposed as editable values.

**Final renderer app (priority after look + audio):** Playwright runs the same render code headless
at 2160×3840, steps the sim decoupled from wall-clock (render frame N → capture canvas → advance one
fixed tick) → ffmpeg → 4K60 MP4. Decoupled timing means slow shaders never drop frames. Audio sync
(phase 2) plugs into the timestamped event log here.

### 7. Dev experimentation lab (`apps/lab`) — internal workbench

A fast, headless, parallel scripting layer on the same `sim`/`score` packages (no divergence):
- **New powers** — define a candidate as data, run round-robin vs the existing 20, read its
  win-rate / drama profile to catch degenerate designs before promotion.
- **Balance analytics** — per-power win rates, matchup dominance matrix, stalemate frequency,
  average resolution time.
- **Scoring experiments** — run one battle set under two `ScoreProfile`s and diff the rankings.
- **Sim-setting sweeps** — vary core constants and measure drama yield.
- **Outputs** terminal tables + optional CSV.
- **Regression snapshots** — locked seed set with expected outcomes, proving engine tweaks don't
  silently change behavior.

Wind tunnel: tune fast here, promote good results into the shared packages.

## Data Flow

1. Author a `SweepSpec` (harness or CLI).
2. Sweep engine expands it → many `BattleConfig`s.
3. Each config → headless sim core → event log → `DramaReport`.
4. Results flush to SQLite (index) + cached logs (top-N).
5. Harness loads the catalog, ranks by `ScoreProfile` (re-rank = pure re-read).
6. Select a candidate → deterministic replay in the player (shared render + HUD).
7. Tune visuals/HUD/scoring live; "Send to render".
8. Renderer re-derives the battle from config, captures 4K60 frames → ffmpeg → MP4.
9. (Phase 2) Audio layer reads the event log timestamps to drive music sync.

## Testing & Error Handling

- **Determinism CI gates (headline):** same seed+config twice → identical event logs + final
  state; headless sim and in-harness sim → identical logs for the same config. If these fail, the
  score-then-render premise is broken.
- **Sim unit tests** — spatial hash bucketing, damage/reflect/heal math, each power's signature
  behavior, tick-cap + stalemate termination.
- **Scoring tests** — synthetic event logs (blowout, comeback, stalemate, close finish) assert
  gates fire and components rank as expected.
- **Sweep engine tests** — spec expansion produces the right config set; stop flag halts cleanly;
  resume continues from cursor without dupes/gaps.
- **Regression snapshots** (lab) — locked seeds with expected outcomes.
- **Error handling** — a throwing battle is caught, logged with its (reproducible) config, and
  skipped so one bad config never kills a multi-hour sweep. SQLite writes are transactional/batched
  so a crash leaves a consistent DB. The renderer fails loudly per-video.

## Open Questions / Future Phases

- **Phase 2 — Audio/music sync:** death → next melody note, fire → drum, explosion → chord; plugs
  into the existing event log. README has the implementation sketch.
- **Arena modes** (shrinking ring, gravity wells, obstacles) as additional sweepable axes.
- **Upload automation / thumbnails / titles** — out of scope until the format is proven.
