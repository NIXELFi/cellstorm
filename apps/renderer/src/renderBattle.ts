// Playwright-driven headless renderer. Runs the SAME @cellstorm/render BattlePlayer the harness
// uses (WYSIWYG), captures exactly one PNG per sim tick, and writes frames/%06d.png. The capture
// loop is wall-clock-decoupled: it steps the sim, renders, screenshots the canvas, and repeats with
// no real-time waiting — so a 60s battle renders as fast as the machine allows, not in 60s.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import type { BattleConfig } from "@cellstorm/sim";
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
  canvas{display:block}
</style></head><body><canvas id="stage"></canvas></body></html>`;

export async function renderBattle(opts: RenderOptions): Promise<RenderResult> {
  const width = opts.width ?? MASTER_WIDTH;
  // Preserve the 9:16 master aspect regardless of the requested width.
  const height = Math.round((width * MASTER_HEIGHT) / MASTER_WIDTH);
  const maxFrames = opts.maxFrames ?? opts.config.maxTicks + 60;
  const progressEvery = opts.progressEvery ?? 60;

  await mkdir(opts.framesDir, { recursive: true });

  // Bundle first so a bundling failure aborts before launching a browser.
  const pageScript = await bundlePageScript();

  // Imported lazily so the module (and its pure helpers) can be loaded without playwright present.
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({ headless: true });
  let frameCount = 0;
  let ended = false;
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(PAGE_HTML, { waitUntil: "load" });
    await page.addScriptTag({ content: pageScript });

    await page.evaluate(
      async (args) => {
        await window.__cellstorm.init(args);
      },
      { config: opts.config, hud: opts.hud, width, height },
    );

    const canvas = page.locator("#stage");

    // Capture tick 0 (initial state) first, then step.
    while (frameCount < maxFrames) {
      await canvas.screenshot({ path: join(opts.framesDir, frameFileName(frameCount)) });
      frameCount++;
      if (opts.onProgress && frameCount % progressEvery === 0) opts.onProgress(frameCount);

      ended = await page.evaluate(() => window.__cellstorm.stepFrame());
      if (ended) {
        // Capture the final post-end frame (winner overlay settles).
        await canvas.screenshot({ path: join(opts.framesDir, frameFileName(frameCount)) });
        frameCount++;
        break;
      }
    }
  } finally {
    await browser.close();
  }

  return { frameCount, ended, width, height };
}
