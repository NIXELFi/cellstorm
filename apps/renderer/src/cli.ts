// render CLI:
//   render --config <configId|inline-json> --db <db> --out <path.mp4> [--hud <json>] [--scale N]
//          [--maxframes N] [--keep]
//
// Loads a BattleConfig (from the SQLite store by id, or inline JSON), renders one PNG per sim tick
// via Playwright, encodes them to a 60fps MP4 with ffmpeg, and cleans up the temp frames dir.

import { parseArgs } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeConfig, type BattleConfig } from "@cellstorm/sim";
import { renderBattleAudioWav, DEFAULT_MUSIC, type MusicSettings } from "@cellstorm/audio";
// Import the HUD config from the pure (no-Pixi) subpath export rather than the @cellstorm/render
// package index, whose BattlePlayer re-export pulls in pixi.js (which touches `navigator` at load
// and throws under Node-side CLI use).
import { DEFAULT_HUD, type HudConfig } from "@cellstorm/render/hud-config";
import { Store } from "@cellstorm/cli";
import { renderBattle, MASTER_WIDTH, SUPERSAMPLE_DEFAULT } from "./renderBattle";
import { encode, CRF_DEFAULT } from "./encode";

export interface RenderCliArgs {
  config?: string;
  db?: string;
  out?: string;
  hud?: string;
  scale?: string;
  /** Supersample factor (render larger, Lanczos-downscale on encode). Defaults to SUPERSAMPLE_DEFAULT. */
  ss?: string;
  /** H.264 CRF (lower = higher quality). Defaults to CRF_DEFAULT. */
  crf?: string;
  /** Custom music track mixed under the synth: JSON `{ path, volume?, startOffsetSec?, ... }`. */
  music?: string;
  maxframes?: string;
  fps?: string;
  keep?: boolean;
  mute?: boolean;
  /** Draw the safe-area debug guides for an on-device occlusion check. */
  "debug-safe"?: boolean;
}

export function parseRenderArgs(argv: string[]): RenderCliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      config: { type: "string" },
      db: { type: "string" },
      out: { type: "string" },
      hud: { type: "string" },
      scale: { type: "string" },
      ss: { type: "string" },
      crf: { type: "string" },
      music: { type: "string" },
      maxframes: { type: "string" },
      fps: { type: "string" },
      keep: { type: "boolean" },
      mute: { type: "boolean" },
      "debug-safe": { type: "boolean" },
    },
  });
  return values as RenderCliArgs;
}

/**
 * Resolve the --config argument to a normalized BattleConfig. If it parses as JSON it is treated as
 * an inline config; otherwise it is looked up in the store by id (which requires --db).
 */
export function resolveConfig(configArg: string, db: string | undefined): BattleConfig {
  const trimmed = configArg.trim();
  if (trimmed.startsWith("{")) {
    return normalizeConfig(JSON.parse(trimmed));
  }
  if (!db) {
    throw new Error("--db is required when --config is a config id (not inline JSON)");
  }
  const store = new Store(db);
  const found = store.getConfig(configArg);
  store.close();
  if (!found) throw new Error(`config id not found in store: ${configArg}`);
  return found;
}

export function resolveHud(hudArg: string | undefined): HudConfig {
  if (!hudArg) return DEFAULT_HUD;
  return { ...DEFAULT_HUD, ...JSON.parse(hudArg) };
}

/**
 * Resolve the --music JSON flag to a track path + merged MusicSettings (defaults filled, enabled
 * unless explicitly false). Returns undefined when no flag is given. Throws if the JSON lacks a path.
 */
export function resolveMusic(musicArg: string | undefined): { path: string; settings: MusicSettings } | undefined {
  if (!musicArg) return undefined;
  const raw = JSON.parse(musicArg) as Partial<MusicSettings> & { path?: string };
  if (!raw.path) throw new Error('--music JSON requires a "path"');
  const { path, ...rest } = raw;
  return { path, settings: { ...DEFAULT_MUSIC, enabled: true, ...rest } };
}

/** Resolve the output canvas width from --scale (a fraction of the 2160px master, default 1). */
export function resolveWidth(scaleArg: string | undefined): number {
  const scale = scaleArg ? Number(scaleArg) : 1;
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`--scale must be > 0, got "${scaleArg}"`);
  return Math.max(2, Math.round(MASTER_WIDTH * scale));
}

async function main(argv: string[]): Promise<void> {
  const args = parseRenderArgs(argv);
  if (!args.config) throw new Error("--config is required (config id or inline JSON)");
  if (!args.out) throw new Error("--out is required");

  const config = resolveConfig(args.config, args.db);
  const hud = resolveHud(args.hud);
  if (args["debug-safe"]) hud.debugSafeArea = true;
  const width = resolveWidth(args.scale);
  const supersample = args.ss ? Number(args.ss) : SUPERSAMPLE_DEFAULT;
  if (!Number.isFinite(supersample) || supersample <= 0) throw new Error(`--ss must be > 0, got "${args.ss}"`);
  const crf = args.crf ? Number(args.crf) : CRF_DEFAULT;
  if (!Number.isFinite(crf) || crf < 0) throw new Error(`--crf must be >= 0, got "${args.crf}"`);
  const maxFrames = args.maxframes ? Number(args.maxframes) : undefined;
  const fps = args.fps ? Number(args.fps) : 60;
  const music = resolveMusic(args.music); // validate up front (throws on bad JSON / missing path)

  const framesDir = mkdtempSync(join(tmpdir(), "cellstorm-frames-"));
  process.stdout.write(
    `Rendering seed=${config.seed} powers=${config.powers.join("/")} width=${width} ss=${supersample} crf=${crf} -> ${args.out}\n`,
  );

  try {
    const result = await renderBattle({
      config,
      hud,
      framesDir,
      width,
      supersample,
      maxFrames,
      // Emit a machine-parseable total so the harness can show a progress bar + ETA (see
      // renderProgress.ts). progressEvery is small so the bar updates smoothly.
      onStart: (total) => process.stdout.write(`Total frames: ${total}\n`),
      onProgress: (f) => process.stdout.write(`  ${f} frames captured...\n`),
      progressEvery: 15,
    });
    const downscaling = result.renderWidth !== result.width;
    process.stdout.write(
      `Captured ${result.frameCount} frames (${result.renderWidth}x${result.renderHeight}` +
        `${downscaling ? ` -> ${result.width}x${result.height} Lanczos` : ""}, ended=${result.ended}). Encoding...\n`,
    );

    // Generate the soundtrack from the SAME Node simulation that produced the video frames
    // (result.log) — guarantees audio and video are the identical battle, perfectly in sync.
    let audioPath: string | undefined;
    if (!args.mute) {
      audioPath = join(framesDir, "audio.wav");
      writeFileSync(audioPath, renderBattleAudioWav(result.log, fps));
      process.stdout.write(`  audio: ${result.log.events.length} events scored -> ${audioPath}\n`);
    }

    // Delay the audio by the flash-forward teaser length so the soundtrack starts at the cut to t=0
    // and stays in sync with the battle. The teaser plays silent (clean visual gut-punch).
    const audioOffsetSec = result.teaserFrames / fps;
    if (music) process.stdout.write(`  music: ${music.path} (vol ${music.settings.volume}, +${music.settings.startOffsetSec}s)\n`);
    await encode({
      framesDir, outPath: args.out, fps, audioPath, audioOffsetSec,
      video: { crf, ...(downscaling ? { scaleW: result.width, scaleH: result.height } : {}) },
      music: music ? { ...music, videoDurationSec: result.frameCount / fps } : undefined,
    });
    process.stdout.write(`Done: ${args.out}${audioPath ? " (with sound)" : " (muted)"}${music ? " (+music)" : ""}\n`);
  } finally {
    if (!args.keep) rmSync(framesDir, { recursive: true, force: true });
    else process.stdout.write(`Kept frames in ${framesDir}\n`);
  }
}

// Run only when invoked directly (not on import). Compare via pathToFileURL so the check works on
// Windows too — a raw `file://${process.argv[1]}` doesn't match import.meta.url there (backslashes,
// drive letter, slash count all differ), which would silently skip main() under `node`/tsx.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
