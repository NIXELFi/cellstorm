# Running Cellstorm

Cellstorm turns deterministic cellular-battle simulations into ranked, previewable,
renderable YouTube Shorts. This document covers how to install, run a sweep, browse and
tune candidates in the harness, render a video, and use the dev lab.

## Prerequisites

Runs on **macOS and Windows** (Linux should work too).

- **Node**: 20+ on macOS, **22.5+ on Windows**. The SQLite store auto-selects native
  `better-sqlite3` when it can build (macOS) and otherwise falls back to Node's built-in
  `node:sqlite` (needs Node ≥ 22.5), so **Windows needs no C++ build tools**. `better-sqlite3` is an
  optional dependency — if its native build fails (e.g. no MSVC on Windows), `pnpm install` still
  succeeds and the store uses `node:sqlite`.
- **pnpm** (tested on 9.15.9).
- **ffmpeg** — **bundled** via the `ffmpeg-static` npm package, installed automatically with
  `pnpm install`. No system ffmpeg needed; a system `ffmpeg` on `PATH` is used as a fallback if the
  bundled binary is ever missing. (Only used for rendering.)
- **Playwright Chromium** — only needed for rendering. After `pnpm install`:

  ```bash
  pnpm --filter @cellstorm/renderer exec playwright install chromium
  ```

## Install

```bash
pnpm install
```

## Run a sweep (headless, populates the SQLite catalog)

The `@cellstorm/cli` package runs a worker-pool sweep, scores each battle, and writes
results into a SQLite catalog. Commands: `sweep`, `list`, `stop`.

> **Note:** `--db` is resolved relative to the **cli package's** cwd (`apps/cli`), so when
> you run it via `pnpm --filter`, a relative path lands inside `apps/cli`. Use an
> **absolute** path to avoid surprises — and so the harness and renderer can point at the
> same file.

`sweep` flags (from `apps/cli/src/cli.ts`):

- `--db <path>` (required) — SQLite catalog file.
- `--teams N` — team count per battle (default 4).
- `--powers random | a,b,c | pool:a,b,c` — power assignment. `random` picks distinct
  powers per seed; a comma list is a fixed assignment (length must equal `--teams`);
  `pool:` picks `--teams` distinct powers from the given pool. Default: `random`.
- `--seeds from-to` — inclusive seed range, e.g. `0-199` (default `0-99`).
- `--batch id` — batch label (default `batch-<timestamp>`); used to scope `list`.
- `--concurrency N` — worker threads (default: auto).
- `--topn N` — keep cached full battle logs only for the top N results.

Concrete example:

```bash
pnpm --filter @cellstorm/cli start sweep \
  --db /Users/me/cellstorm-data/cellstorm.db \
  --teams 4 --powers random --seeds 0-199 \
  --batch demo --concurrency 4 --topn 25
```

List the best results:

```bash
pnpm --filter @cellstorm/cli start list --db /Users/me/cellstorm-data/cellstorm.db --n 10
# scope to one batch:
pnpm --filter @cellstorm/cli start list --db /Users/me/cellstorm-data/cellstorm.db --n 10 --batch demo
```

Stop a running sweep (writes a stop file the runner polls):

```bash
pnpm --filter @cellstorm/cli start stop --db /Users/me/cellstorm-data/cellstorm.db
```

## Launch the harness

The harness is a browser UI for browsing the ranked grid, replaying a candidate in the
shared player (preview == render), and tuning the HUD. `pnpm harness` (root script) runs
the bridge server **and** Vite together via the `apps/harness/dev.mjs` launcher (it spawns each
with `node` directly, so it behaves identically on macOS and Windows).

```bash
pnpm harness
```

- Vite dev server: **http://localhost:5173**
- Bridge server (SQLite + sweep control): port **5174** (Vite proxies `/api` to it).

The bridge server's DB path defaults to `./data/cellstorm.db` **relative to the harness
package cwd** (`apps/harness/data/cellstorm.db`). To point the harness at the same catalog
a sweep wrote, set `CELLSTORM_DB` to the **same absolute path** you used for `--db`:

```bash
CELLSTORM_DB=/Users/me/cellstorm-data/cellstorm.db pnpm harness
```

(The bridge also accepts `--db <path>` and `PORT`, but env is easiest through the root
`pnpm harness` script.)

## Render a video

The `@cellstorm/renderer` CLI drives the shared player frame-by-frame with Playwright
(one PNG per sim tick) and encodes to a 60fps MP4 with ffmpeg. Requires the Chromium
install step above.

`render` flags (from `apps/renderer/src/cli.ts`):

- `--config <configId | inline-JSON>` (required) — a catalog config id (form
  `teamCount:powers:seed`, e.g. `4:Tank,Plague,Sniper,Swift:999`) or an inline
  `BattleConfig` JSON object (starts with `{`). A config id requires `--db`.
- `--db <path>` — catalog file (required when `--config` is an id, not inline JSON).
- `--out <path.mp4>` (required) — output video.
- `--scale N` — fraction of the 2160×3840 master canvas (default `1` = full 4K vertical).
- `--maxframes N` — cap captured frames (smoke tests).
- `--hud <json>` — HUD config overrides (merged onto defaults).
- `--keep` — keep the temp PNG frames dir instead of deleting it.

Low-res smoke render straight from an inline config (no DB needed):

```bash
pnpm --filter @cellstorm/renderer render \
  --config '{"seed":999,"teamCount":4,"powers":["Tank","Plague","Sniper","Swift"]}' \
  --out /tmp/smoke.mp4 --scale 0.1 --maxframes 120
```

Full 4K render of a catalog candidate (default scale = 1):

```bash
pnpm --filter @cellstorm/renderer render \
  --db /Users/me/cellstorm-data/cellstorm.db \
  --config 4:Tank,Plague,Sniper,Swift:999 \
  --out /Users/me/cellstorm-data/out.mp4
```

## Dev lab

The `@cellstorm/lab` workbench runs deterministic analytics with no DB. Subcommands:
`roundrobin`, `balance`, `snapshot`, `scorediff`.

```bash
# power-vs-power win-rate matrix
pnpm --filter @cellstorm/lab lab roundrobin --powers Tank,Glasshammer,Plague --seeds 4

# per-power analytics sweep
pnpm --filter @cellstorm/lab lab balance --teams 2 --seeds 6

# deterministic regression snapshot (locked configs -> outcomes)
pnpm --filter @cellstorm/lab lab snapshot

# compare two ScoreProfiles' rankings over a config set
pnpm --filter @cellstorm/lab lab scorediff
```

## Testing

```bash
pnpm test        # vitest run, whole workspace
pnpm typecheck   # tsc -b, whole workspace
```

## Architecture at a glance

| Package / app           | Role |
|-------------------------|------|
| `packages/sim`          | Deterministic sim core. Seeded mulberry32 PRNG, fixed timestep, no wall-clock. `runBattle(config)` is the headless driver and the determinism contract (seed → identical battle + event log). |
| `packages/score`        | Headless drama scorer. `score(log, profile)` → gates + weighted components → `DramaReport`. Reads the sim's event log + team-count timeline. |
| `packages/render`       | Shared PixiJS scene + HUD compositor + `BattlePlayer`. Used by both the harness preview and the final renderer, so preview == render. Its sim loop is determinism-equivalent to `runBattle`. |
| `apps/cli`              | Resumable worker-pool sweep engine + SQLite store (`@cellstorm/cli`). Commands: `sweep` / `list` / `stop`. |
| `apps/harness`          | Browser UI + node bridge server. Browse the ranked grid, replay candidates in the shared player, edit the HUD, tune. |
| `apps/renderer`         | 4K60 render app. Playwright drives the shared player frame-by-frame; ffmpeg encodes to MP4. |
| `apps/lab`              | Dev experimentation lab: round-robin matrix, per-power balance, regression snapshots, score-profile diffs. |

Determinism (seed → identical battle) is the central contract: a single seeded PRNG, a
fixed timestep, and no wall-clock reads. The same event log drives the scorer, the harness
drama curve, and future audio. The render package is shared by harness and renderer so
preview matches the final output (WYSIWYG).

See the design spec and implementation plan under `docs/superpowers/`:

- `docs/superpowers/specs/2026-05-27-cellstorm-design.md`
- `docs/superpowers/plans/2026-05-27-cellstorm-v1.md`
