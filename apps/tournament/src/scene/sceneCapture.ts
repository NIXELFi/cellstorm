// NODE side: bundle the browser scene entry (esbuild -> IIFE) and drive it through Playwright, one
// screenshot per frame into framesDir/%06d.png — the SAME capture pattern (and frame naming) as
// renderBattle, so scene PNGs feed the SAME encode() and come out byte-compatible with battle clips.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import { frameFileName } from "@cellstorm/renderer";
import type { Dims } from "../dims";
import type { ScenePayload } from "./sceneData";

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#08070d;overflow:hidden}
  #scene{position:absolute;inset:0}
</style></head><body><div id="scene"></div></body></html>`;

/** Bundle sceneEntry.ts (+ its pure imports) into a single browser IIFE, like renderBattle's page. */
export async function bundleSceneScript(): Promise<string> {
  const entry = join(import.meta.dirname, "sceneEntry.ts");
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    write: false,
    legalComments: "none",
    logLevel: "silent",
  });
  const out = result.outputFiles[0];
  if (!out) throw new Error("esbuild produced no scene bundle");
  return out.text;
}

/** Render `frames` screenshots of `payload` into framesDir at the capture resolution. Returns count. */
export async function captureScene(
  payload: ScenePayload,
  d: Dims,
  frames: number,
  framesDir: string,
): Promise<number> {
  await mkdir(framesDir, { recursive: true });
  const script = await bundleSceneScript();
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: d.renderWidth, height: d.renderHeight } });
    await page.setContent(PAGE_HTML, { waitUntil: "load" });
    await page.addScriptTag({ content: script });
    await page.evaluate((a) => window.__scene.init(a), {
      payload,
      width: d.renderWidth,
      height: d.renderHeight,
      totalFrames: frames,
    });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    for (let t = 0; t < frames; t++) {
      await page.evaluate((tt) => window.__scene.drawFrame(tt), t);
      await page.screenshot({ path: join(framesDir, frameFileName(t)) });
    }
  } finally {
    await browser.close();
  }
  return frames;
}
