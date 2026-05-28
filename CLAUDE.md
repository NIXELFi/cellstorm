# Cellstorm

Internal tooling (just Nick + Claude) that generates entertaining **YouTube Shorts** from
deterministic "cellular battle royale" simulations: N teams of cells, each team with one of 20
powers, last team standing wins. Built from the `battle.html` prototype concept.

**The core bet:** the simulation stays honest — no engineered drama. Entertainment is bought
through **volume**: run thousands of deterministic seeds, score each on a "drama curve," keep the
top ~1%, render those. Design docs live in `docs/superpowers/` (spec + plan).

---

## Architecture (pnpm monorepo, TypeScript)

```
packages/
  sim/      @cellstorm/sim    — pure deterministic engine (NO DOM/render deps)
  score/    @cellstorm/score  — BattleLog -> DramaReport (gates + weighted components)
  audio/    @cellstorm/audio  — pure: BattleLog -> AudioScore -> synthesized PCM/WAV (no DOM/Node)
  render/   @cellstorm/render — PixiJS scene + CSS HUD + BattlePlayer (shared by harness & renderer)
apps/
  cli/      @cellstorm/cli    — sweep engine + SQLite store (also a library: Store, runSweep, expand)
  harness/  @cellstorm/harness— Vite browser app + node:http bridge server (the day-to-day tool)
  renderer/ @cellstorm/renderer— Playwright frame capture + ffmpeg -> MP4
  lab/      @cellstorm/lab    — headless balance/analytics scripts + ad-hoc *.mts studies
```

Dependency direction is one-way: `sim` depends on nothing; `render`/`score` depend on `sim`; apps
depend on packages. Keep `sim` free of DOM/Pixi/Node-only imports.

### THE DETERMINISM CONTRACT (most important invariant)
`runBattle(config)` is deterministic **within one JS engine**: same seed → bit-identical event log
every run. This makes "score then render" valid.
- **No `Math.random` / `Date.now` / `performance.now` / `requestAnimationFrame`-timing in
  `packages/sim/src`.** All gameplay randomness comes from one seeded `mulberry32` PRNG in the
  `World` (`prng.ts`), seeded from `config.seed`. Fixed timestep; nothing reads wall-clock.
- **⚠️ NOT bit-identical ACROSS V8 builds.** Node, headless Chromium, and a user's browser round
  `a*b+c` differently (FMA contraction) — a ~1 ULP/op difference that a chaotic battle amplifies into
  a *different winner* over thousands of ticks. So the browser MUST NOT simulate independently. We
  simulate ONCE in Node and ship the per-tick drawable state (`captureFrames`/`packFrames` in
  `sim/drawframe.ts`); the renderer and the harness preview only DRAW it (`BattlePlayer.renderSnapshot`),
  and audio is scored from that same Node log. Result: **preview == render == audio on every engine.**
  (Do NOT "optimize" the renderer/harness back to stepping their own sim — that's the exact bug that
  shipped a different battle than the preview. See git log: fix/render-determinism.)
- **Three RNG streams:** the *gameplay* stream lives in the sim; the *cosmetic* stream (particles/FX)
  is owned by the renderer/player, seeded `config.seed ^ COSMETIC_SALT`; the *audio* stream lives in
  `@cellstorm/audio`, seeded `config.seed ^ AUDIO_SALT`. Visual/audio tweaks must never perturb
  gameplay → scoring is immune to them. Audio is a pure *consumer* of the BattleLog; it cannot
  affect the sim.
- CI gates: `packages/sim/test/determinism.test.ts` (two runs identical) and
  `packages/render/test/playerSim.test.ts` (player stepping == headless runBattle).
- The HUD animates from the **deterministic tick**, not CSS time — the renderer is wall-clock-
  decoupled (steps + screenshots, no real time passes), so CSS `@keyframes`/`transitions` would be
  frozen in the MP4. Counts/intro-fade/winner-pop are computed from the tick and applied inline.

---

## Running it

Toolchain: pnpm 9. ffmpeg is bundled via the `ffmpeg-static` npm package (no system install); only
Playwright Chromium needs a one-time `pnpm --filter @cellstorm/renderer exec playwright install
chromium`. Both are needed for *rendering only*. **Cross-platform: macOS + Windows** (Linux should
work too). Node 20+ on macOS; **Node 22.5+ on Windows** — the SQLite store auto-detects its backend
(native `better-sqlite3`, else Node's built-in `node:sqlite`), so Windows runs with no C++ build
tools. See "Cross-platform notes" below.

```bash
pnpm install
pnpm test         # vitest, all packages
pnpm typecheck    # tsc -b  (ALWAYS confirm exit 0 before committing — see Gotchas)

# Harness (the main tool): bridge server + Vite, one command.
CELLSTORM_DB="$HOME/Developer/cellstorm/data/cellstorm.db" pnpm harness
#   Vite UI:  http://localhost:5173   Bridge API: http://localhost:5174 (Vite proxies /api)

# Headless sweep (also runnable from the harness UI "Start sweep"):
pnpm --filter @cellstorm/cli start sweep --db <ABS_PATH> --teams 4 --powers random --seeds 0-200 --batch v1 --concurrency 4 --topn 40

# Render one MP4 (the harness "Render video" button does this via the bridge). Sound is muxed in by
# default; pass --mute for a silent render. NOTE: --scale must yield EVEN width AND height (libx264
# + yuv420p reject odd dimensions) — 0.25 -> 540x960 and 0.5 -> 1080x1920 are safe; 0.18 -> 389 is not.
pnpm --filter @cellstorm/renderer exec tsx src/cli.ts --config <configId|inlineJSON> --db <db> --out out.mp4 --scale 0.5 [--hud '<json>'] [--mute]

# Dev lab:
pnpm --filter @cellstorm/lab lab {roundrobin|balance|snapshot|scorediff}
```

`RUNNING.md` has more detail. Rendered MP4s land in `out/` (gitignored). The SQLite catalog +
gzipped logs live under `data/` (gitignored).

### The harness launcher
`pnpm harness` runs `apps/harness/dev.mjs` — a small Node launcher that spawns `tsx src/server.ts`
(bridge) + `vite` directly with inherited stdio. **Do NOT** revert to `concurrently "pnpm server"
"vite"`: tsx didn't survive concurrently's nested shell and the bridge silently died.

---

## Persistence / data model (`apps/cli/src/store.ts`)
SQLite (`better-sqlite3`). One row per battle in `results`:
`{configId, config(JSON), score, breakdown(JSON), winner, durationTicks, batchId, videoMade}`.
- **`configId` = `${teamCount}:${powers.join(",")}:${seed}`** — the single source of truth is
  `apps/cli/src/configId.ts` (node-dep-free; harness imports it browser-safely via the
  `@cellstorm/cli/config-id` subpath export). Because the sim is deterministic, a config is a
  complete, tiny recipe — heavy data never needs storing to reproduce a battle/log/render.
- Logs: gzipped under `${db}-logs/`, cached only for the top-N of a sweep; others re-derive on
  demand (deterministic). `videoMade` is a user-set "I made a video of this" flag.
- Sweeps are resumable (filter out already-stored configIds) and stoppable (a `${db}.stop` file the
  worker polls), run across `worker_threads` (hand-rolled pool; hang-proof on worker death).

---

## Current tuning state (all in `packages/sim/src`, found via the lab studies)
The original prototype values were poorly balanced; the shipped defaults came from optimization
studies (see the `apps/lab/*.mts` scripts; rebuild similar ones to re-tune).
- **`DEFAULT_AI` (config.ts):** `perceptionR2 4096` (64px), `scanWindow 5`, `retreatHpFrac 0`
  (cells commit), `huntCenterBias 0.04` (stragglers converge), `damageScale 0.15`. This took
  resolution 20%→88%, drama yield ~4.4×, and centers **video length ~25s** (p25 15s / p75 40s).
- **`damageScale` is a uniform combat-pace knob** — applied to ALL damage AND healing (melee,
  projectiles, explosions, plague DoT, heals) inside `applyDamage`/`abilities`/`damage.ts`, so
  power balance is independent of fight duration. (Scaling only melee distorts balance — don't.)
- **`outroTicks` (default 48 ≈ 0.8s):** after a winner is decided, the sim keeps stepping a victory
  beat so the final wipe + win land on screen. `summary.durationTicks` = fight length (scored);
  `summary.totalTicks` = playback/video length (fight + outro).
- **Power balance:** rebalanced from a 1v1 round-robin to compress the win-rate spread (Goliath was
  99.5% — its RADIUS was the dominator, not HP). Note: 1v1 win-rate is chaotic/threshold-sensitive;
  multi-team is the real shipping context. Ranged/DoT/kite powers (Sniper/Plague/Magnet) are weak
  in 1v1 because retreat is off — they'd want kiting AI (future).
- **Scoring (`DEFAULT_PROFILE`, score/types.ts):** duration gates 15–40s (Shorts target); weighted
  components: comeback (1.5), leadVolatility, climaxTiming, closeFinish, sustainedChaos (0.5).
  Lead volatility was ~0 (steamrolls); balancing raised it ~3×.

---

## Rendering & HUD
- **Cold-open hook (shared `@cellstorm/render/opening`):** every render — AND the harness preview —
  OPENS on a ~0.9s title-free **rapid multi-cut montage** (default 3 hard cuts, ~300ms each) of distinct
  peak-action moments, building to the most intense, then HARD-CUTS to t=0 where the title is composited as an
  **overlay over the live battle** (never a static card; the sim never freezes). Retention fix — a static
  title card had a ~75% swipe-away; a single continuous clip read as an accidental leftover, so it's a
  montage. It's purely a reorder of the already-computed frames (`buildOpeningSequence` →
  `{order:[clip1…,clip2…,clip3…,0..N], cutAt, cutPoints}`), so the battle is byte-identical (A/B-safe);
  the teaser's large ticks make the tick-driven title auto-absent there, and pre-resolution ticks keep
  the winner card from leaking. Peaks: the back 60% of the fight is split into N **time bands**
  (distinct phases → visually different cuts), each band's densest weighted window (death×3 + explosion×2
  + projectile×0.5) is a clip; low-action bands (<25% of the strongest) are dropped so it never cuts to a
  lull; clips are ordered escalating. FX are reset at **every** cut (`cutPoints` → `resetCosmeticState`);
  at the final cut the HUD un-hides + primes counts so they're correct from frame one. Audio is delayed
  by the teaser length (ffmpeg `-itsoffset`) so it still lines up with the battle (teaser is silent).
  Tunable via `DEFAULT_OPENING` (`teaserMs`, `cuts`, `peakBackFraction`, `enabled`); default ON. The
  preview plays the montage too (playback is sequence-position-based over `order`), so it's WYSIWYG.
- **WYSIWYG:** harness preview and the 4K/1080 renderer use the SAME `BattlePlayer` + `CssHud`.
- Renderer (`apps/renderer`): esbuild bundles `page-entry.ts` (BattlePlayer + pixi) into an IIFE,
  Playwright injects it, steps one frame per tick, **screenshots the full page** (canvas + CSS HUD
  overlay), waits for `document.fonts.ready`, then ffmpeg → MP4. Default scale 0.5 = **1080×1920**
  (Shorts-native, ~1–2 min). `scale 1` = 2160×3840 (much slower via per-frame screenshots).
- The harness "Render video" button → `POST /api/render` spawns the renderer CLI, tracks progress
  via stdout, and on success reveals + opens the file via the OS file manager (per-OS commands in
  `apps/harness/src/revealCommands.ts`: Finder/`open` on macOS, Explorer/`start` on Windows,
  `xdg-open` on Linux). Best-effort; exit codes ignored.
- **HUD is real DOM/CSS** (`packages/render/src/cssHud.ts`), overlaid on the canvas — Anton (display)
  + Archivo, on the dark neon field. Three parts, all tick-driven:
  - **Intro** (~2.5s, `introSeconds`): "CELLSTORM / WHO SURVIVES? / N teams… last cell wins" + per-power
    chips (`descs.ts`); a LIGHT scrim overlaid on the **live battle** (counts strip stays visible
    underneath from frame one), fading out on the tick. After the cold-open cut, this is the title that
    sits over the already-running battle (see "Cold-open hook" above). `CssHud.setHidden` suppresses the
    whole HUD during the teaser; `primeCounts` seeds the live numbers at the cut.
  - **Top strip** (live): a slim proportional segmented bar (each team sized by cell share, shrinks
    as it dies) + a single **centered, auto-fit** label row (color dot + power name + count). Sits
    on a darkening+blur scrim (`.cs-topscrim`). NO descriptions in the live HUD (they're in intro).
  - **Winner**: glowing "[POWER] WINS" + survivor count over a matching darkening+blur gradient.
- **Cells (scene.ts):** team color = primary identity; SHAPE = archetype (square=tanky,
  triangle=aggressive/fast, diamond=burst/ranged, hexagon=control, circle=sustain — `glyphs.ts`).
  Glow layer + state FX (charger dash trail, plague tint, stun dim, frenzy heat, heal/shield halos)
  + styled death bursts (Glasshammer shatter, Bomb shockwave). Random per-team spawn locations.
- **Post-FX (`postfx.ts` + `postfxLogic.ts`):** a filter stack (`pixi-filters`) wraps the scene in the
  player — neon **bloom**, soft **vignette** (a `CRTFilter` with only vignetting on), **color grade**
  (`AdjustmentFilter`), plus **chromatic aberration** + a small **screen shake** that swell on
  explosions/deaths and a brief brightness/bloom **pop on the winner reveal**. Cosmetic only (reads no
  gameplay RNG). Tasteful/minimal but visible. Applied to the Pixi canvas only — the CSS HUD stays
  crisp on top. The shake lives on an inner container (vignette stays screen-fixed) with a 1.5%
  overscan so it never exposes the border. ALL reactive uniforms are driven from the **sim tick** (the
  `impact` envelope + winner flash), never wall-clock — so the FX render identically in the headless
  renderer instead of freezing. The reactive math is pure + unit-tested in `postfxLogic.ts`.

---

## Audio (`@cellstorm/audio`)
Sound is a **separate track muxed by ffmpeg**, not played live — the renderer is wall-clock-decoupled
(steps + screenshots), so nothing can "play" during capture. The package is pure (no DOM/Pixi/Node),
so the SAME code makes the WAV the renderer muxes AND the PCM the harness plays via Web Audio →
audio is WYSIWYG like the visuals. Pipeline: `BattleLog -> buildAudioScore() -> renderScore() (stereo
Float32 PCM) -> pcmToWav()`. No samples — everything is synthesized (oscillators + analytic envelopes).
- **Always-consonant by construction — and STATIC (no rotation):** the root + tempo come from
  `config.seed`, but the harmony is fixed for the whole battle: one **major-pentatonic** scale (every
  note mutually consonant) over one sustained **major-6 backing chord** (`music.ts`). Each team owns
  **one permanent pentatonic note** (`Voice.degree`, never changes) with a **soft, sine-based** archetype
  timbre (mirrors `render/glyphs.ts`: tank/sustain→sine, aggressive→`boop`, burst→bell, control→triangle
  — no raw square/saw/pulse, no piano). A team still sounds like it looks, gently.
- **Event mapping (`score.ts`):** death = the team's one fixed note (NO octave climb, NO rotation),
  panned by x; explosion = low boom + faint crack; projectileFire = quiet high blip; leadChange =
  ascending arpeggio of the fixed chord (identical every time); battleEnd = resolving block chord (pad)
  + ascending arpeggio (skipped on a stalemate).
- **Musical bed:** the single fixed chord, sustained as a soft pad + low root bass, re-voiced each bar
  so its **volume swells with on-screen action density** (a deaths/sec envelope) — but the pitches never
  change. A gentle `boop` sparkle is added only when the action is hot.
- **Synth (`synth.ts`):** soft, sine-based timbres (short, rolled-off harmonic sums) + gentle envelopes,
  a one-pole ~6kHz high-cut, and a real **brick-wall peak limiter** (instant attack / ~80ms release,
  ceiling 0.8) that GUARANTEES the output never approaches full scale — it cannot hard-clip even with
  many teams stacking events (a unit test pins this; verified ~−1.7 dBFS on a 5-team render).
- **Renderer:** `renderBattle` simulates once in Node (`captureFrames`) and returns that `log`; the
  CLI scores the audio from the SAME log (so audio == video, perfectly synced), writes `audio.wav`, muxes it
  (`ffmpegArgs(..., audioPath)` adds `-i audio.wav -c:a aac -b:a 192k -shortest`). `--mute` skips it.
- **Harness:** a **"Sound" toggle** plays the same synthesized buffer through Web Audio, started in
  lockstep with playback. Synced **only at 1× from the current frame**; scrubbing / speed≠1 / pause
  stop it (the MP4 is the real fidelity check). Decision rules: `ui/previewAudioLogic.ts` (unit-tested).

## Gotchas / hard-won lessons
- **Verify `pnpm typecheck` exits 0 BEFORE committing** (and run `pnpm test`). A type error was
  committed once by not reading the typecheck output.
- **Bridge must never block on `runBattle`** (it's single-threaded). The grid fetches logs
  **cached-only** (`GET /api/log/:id?cachedOnly=1` → instant 404 if not cached, never re-derives);
  otherwise dozens of synchronous re-derivations froze the whole UI. The player's jump-to-climax
  uses the full `/api/log` (one at a time, fine).
- **Normalize configs on read** in the bridge (`normalizeConfig(cfg)` in `/api/config` and
  `/api/log`): a config persisted before a field existed (e.g. `outroTicks`) made `step` compare
  against `NaN` and loop forever. `step.ts` also guards `outroTicks` against non-finite.
- **Spawn `tsx` by absolute path**, not a bare `"tsx"` (PATH-dependent → ENOENT when the bridge is
  launched directly). See `resolveTsxBin` in `server.ts`.
- **HUD CSS:** the renderer page wrapper has `line-height: 0` (kills canvas inline gap) which
  inherits into the HUD — `.cs-hud` sets `line-height` so text isn't collapsed to 0 height.
- **Fitting one line:** measure with `offsetWidth` on a `width:max-content` element (not
  `scrollWidth`, which under-measures content overflowing left of a centered row) and apply a
  `transform: scale()`, centered via the parent's `align-items: center`.
- **Background processes:** launch long-running servers with the Bash tool's `run_in_background`
  (or they get reaped when the call ends). After editing `server.ts` (tsx, not HMR), restart the
  harness; render-only changes (cssHud/scene) hot-reload via Vite — just refresh.
- Re-running a sweep with the same spec/seeds is a no-op (resume skips already-stored configIds);
  new battles need new seeds or new power combos. The grid shows "nothing new — already computed".

---

## Status / possible next steps
V1 is built and on `main` (merged from `feat/cellstorm-v1`). The renderer produces real 1080×1920
60fps MP4s with the full broadcast HUD baked in **and a synthesized soundtrack** (see Audio above;
on `feat/cellstorm-audio`, 173 tests green). The **cold-open flash-forward hook is now built** (see
"Cold-open hook" under Rendering & HUD — `opening.ts`); it replaced the static title card that was
causing the ~75% swipe-away. Open follow-ups discussed but not built: kiting AI for ranged powers, a
render resolution toggle (1080/4K) + faster capture (CDP screencast), and an end-to-end integration
test for the harness→bridge→render flow.
Audio follow-ups: richer per-power leitmotifs, sidechain/ducking, and a stereo-width pass.

## Cross-platform notes (macOS + Windows)
Everything except the *external render tools* (ffmpeg, Playwright Chromium) runs on both OSes from the
same code. The platform-specific seams and how they're handled:
- **SQLite backend is auto-selected by capability** (`apps/cli/src/sqlite.ts`): it probes native
  `better-sqlite3` (constructs an in-memory db — `require` alone succeeds even when the native binary
  is missing) and falls back to Node's built-in `node:sqlite` (`DatabaseSync`, Node ≥ 22.5). So macOS
  keeps native speed and Windows runs with no MSVC toolchain. `better-sqlite3` is an
  **optionalDependency** — if its build fails (e.g. on Windows), `pnpm install` still completes.
  `node:sqlite` emits a one-line `ExperimentalWarning` per process; harmless.
- **Child .ts processes are launched as `node --import <tsx-loader> script.ts`**, never via the tsx
  `.bin` shim. Node 24 on Windows refuses to spawn a `.cmd` without `shell:true`, and `shell:true`
  would mangle the JSON `--config`/`--hud` args. The loader is resolved to a `file://` URL (a bare
  `C:\` path is rejected by `--import`). Applies to `dev.mjs`, and the sweep/render spawns in
  `server.ts`. (The sweep's *worker threads* already use a `new URL(...)` bootstrap — portable.)
- **Reveal/open after a render** branches on `process.platform` — see the "Render video" note above.
- **Log-cache filenames encode the configId** (`encodeURIComponent`) because the id contains `:`,
  which is illegal in Windows filenames (`store.ts`). Reversed in `cachedLogIds`.
- **Tests use `os.tmpdir()`**, not hardcoded `/tmp`.

## Conventions
- End git commit messages with: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- Commit/push only when asked. Keep `sim` pure. Prefer small, focused files.
