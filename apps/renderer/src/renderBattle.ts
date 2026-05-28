// Playwright-driven headless renderer. Runs the SAME @cellstorm/render BattlePlayer the harness
// uses (WYSIWYG), captures exactly one PNG per sim tick, and writes frames/%06d.png. The capture
// loop is wall-clock-decoupled: it steps the sim, renders, screenshots the canvas, and repeats with
// no real-time waiting — so a 60s battle renders as fast as the machine allows, not in 60s.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import { captureFrames, packFrames, type BattleConfig, type BattleLog } from "@cellstorm/sim";
import type { HudConfig } from "@cellstorm/render/hud-config";

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
  /** Progress callback, called every `progressEvery` frames. */
  onProgress?: (frame: number) => void;
  progressEvery?: number;
}

export interface RenderResult {
  frameCount: number;
  ended: boolean;
  width: number;
  height: number;
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

  // Bundle first so a bundling failure aborts before launching a browser.
  const pageScript = await bundlePageScript();
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({ headless: true });
  let frameCount = 0;
  const total = Math.min(frames.length, maxFrames);
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

    for (let i = 0; i < total; i++) {
      await page.evaluate((idx) => window.__cellstorm.drawFrame(idx), i);
      await shot();
      frameCount++;
      if (opts.onProgress && frameCount % progressEvery === 0) opts.onProgress(frameCount);
    }
  } finally {
    await browser.close();
  }

  return { frameCount, ended: total >= frames.length, width, height, log };
}
