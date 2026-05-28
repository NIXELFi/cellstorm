// Playwright-driven headless renderer. Runs the SAME @cellstorm/render BattlePlayer the harness
// uses (WYSIWYG), captures exactly one PNG per sim tick, and writes frames/%06d.png. The capture
// loop is wall-clock-decoupled: it steps the sim, renders, screenshots the canvas, and repeats with
// no real-time waiting — so a 60s battle renders as fast as the machine allows, not in 60s.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import { captureFrames, packFrames, type BattleConfig, type BattleLog } from "@cellstorm/sim";
import type { HudConfig } from "@cellstorm/render/hud-config";
import { buildOpeningSequence, DEFAULT_OPENING, type OpeningConfig } from "@cellstorm/render/opening";

// Master 9:16 resolution for production renders.
export const MASTER_WIDTH = 2160;
export const MASTER_HEIGHT = 3840;

/** Zero-padded 6-digit frame filename (ffmpeg %06d.png), 0-based: frame 0 -> 000000.png. */
export function frameFileName(index: number): string {
  return `${String(index).padStart(6, "0")}.png`;
}

export interface RenderOptions {
  config: BattleConfig;
  hud: HudConfig;
  framesDir: string;
  /** Output canvas width in pixels. Height is derived to keep the 9:16 master aspect. */
  width?: number;
  /** Hard cap on captured frames (safety + fast smoke renders). */
  maxFrames?: number;
  /** Cold-open hook config (flash-forward teaser). Defaults to DEFAULT_OPENING; pass `enabled:false`
   *  to render the plain battle. Overrides are shallow-merged onto the defaults. */
  opening?: Partial<OpeningConfig>;
  /** Called once with the total frame count before the capture loop starts (for progress %/ETA). */
  onStart?: (total: number) => void;
  /** Progress callback, called every `progressEvery` frames. */
  onProgress?: (frame: number) => void;
  progressEvery?: number;
}

export interface RenderResult {
  frameCount: number;
  ended: boolean;
  width: number;
  height: number;
  /** Number of flash-forward teaser frames prepended before t=0 (0 if no teaser). The caller offsets
   *  the audio by this many frames so the soundtrack still lines up with the real battle. */
  teaserFrames: number;
  /** The authoritative battle log from the SAME Node simulation that produced the frames (so the
   *  caller can generate perfectly-synced audio from it — single source of truth). */
  log: BattleLog;
}

/** Bundle the browser page entry (BattlePlayer + pixi) into a single IIFE esbuild can inject. */
export async function bundlePageScript(): Promise<string> {
  const entry = join(import.meta.dirname, "page-entry.ts");
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    write: false,
    // pixi.js + render are pure ESM; let esbuild resolve them via the workspace node_modules.
    legalComments: "none",
    logLevel: "silent",
  });
  const out = result.outputFiles[0];
  if (!out) throw new Error("esbuild produced no output");
  return out.text;
}

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#000;overflow:hidden}
  #wrap{position:relative;display:inline-block;line-height:0}
  canvas{display:block}
  #hud{position:absolute;inset:0}
</style></head><body><div id="wrap"><canvas id="stage"></canvas><div id="hud"></div></div></body></html>`;

export async function renderBattle(opts: RenderOptions): Promise<RenderResult> {
  const width = opts.width ?? MASTER_WIDTH;
  // Preserve the 9:16 master aspect regardless of the requested width.
  const height = Math.round((width * MASTER_HEIGHT) / MASTER_WIDTH);
  const maxFrames = opts.maxFrames ?? opts.config.maxTicks + 60;
  const progressEvery = opts.progressEvery ?? 60;

  await mkdir(opts.framesDir, { recursive: true });

  // SINGLE SOURCE OF TRUTH: simulate the whole battle ONCE in Node and capture the drawable frames.
  // The browser only draws these — it never re-sims — so the render is identical to the harness
  // preview (which replays the same Node frames) regardless of V8 build. Pack to base64 to ship it.
  const { log, frames } = captureFrames(opts.config);
  const framesB64 = Buffer.from(packFrames(frames)).toString("base64");

  const total = Math.min(frames.length, maxFrames);

  // COLD OPEN: decide the output frame ORDER — a short flash-forward of peak action, then a hard cut
  // to t=0. This only reorders/prepends the already-computed frames (no re-sim), so the battle stays
  // byte-identical; only the opening composition changes. The teaser frames carry large sim ticks, so
  // the title overlay (tick-driven) is automatically absent there and the winner card can't leak.
  const opening: OpeningConfig = { ...DEFAULT_OPENING, ...opts.opening };
  const sequence = buildOpeningSequence(log, total, opening);

  // Announce the full output length (teaser + battle) up front so the caller's progress bar/ETA is
  // accurate, not an open-ended "N frames captured".
  opts.onStart?.(sequence.order.length);

  // Bundle first so a bundling failure aborts before launching a browser.
  const pageScript = await bundlePageScript();
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({ headless: true });
  let frameCount = 0;
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(PAGE_HTML, { waitUntil: "load" });
    await page.addScriptTag({ content: pageScript });

    await page.evaluate(
      async (args) => { await window.__cellstorm.init(args); },
      { config: opts.config, hud: opts.hud, width, height, framesB64, events: log.events },
    );

    // Screenshot the full viewport (canvas + CSS HUD overlay) so the broadcast HUD bakes in.
    const shot = () => page.screenshot({ path: join(opts.framesDir, frameFileName(frameCount)) });

    const cutSet = new Set(sequence.cutPoints);
    for (let i = 0; i < sequence.order.length; i++) {
      const frameIndex = sequence.order[i]!;
      const hudHidden = i < sequence.cutAt; // teaser montage: clean, title-free
      const resetCosmetic = cutSet.has(i); // wipe FX at every hard cut so each clip lands clean
      await page.evaluate(
        (a) => window.__cellstorm.drawFrame(a.idx, a.hud, a.reset),
        { idx: frameIndex, hud: hudHidden, reset: resetCosmetic },
      );
      await shot();
      frameCount++;
      if (opts.onProgress && frameCount % progressEvery === 0) opts.onProgress(frameCount);
    }
  } finally {
    await browser.close();
  }

  return { frameCount, ended: total >= frames.length, width, height, teaserFrames: sequence.cutAt, log };
}
