// Screenshot studio: capture a few representative STILLS from a fixed set of fights, for visual
// A/B review of render changes. Reuses the same Playwright + BattlePlayer capture path as the video
// renderer (WYSIWYG), but:
//   - the cold-open montage is OFF (we draw raw ticks, so frame N == tick N and stills are comparable
//     across labels),
//   - it grabs only a handful of ticks per fight (3 fractions of the fight + 1 auto-detected peak-
//     action tick), warming up a short window before each so cosmetic FX (bursts/flashes/trails) are
//     present in the still rather than empty,
//   - no ffmpeg video encode; each tick is one PNG. When --ss > 1 the canvas is rendered larger and
//     each PNG is Lanczos-downscaled to the output size (same as the real supersample pipeline).
//
// Usage:
//   tsx src/shots.ts --out <dir> --label <name> [--scale 0.5] [--ss 1] [--warmup 14] [--hud]
//
// The fight set is FIXED (seeds + power matchups) so every label renders the identical battles —
// the only variable between folders is the render change under review.

import { parseArgs } from "node:util";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { captureFrames, packFrames, normalizeConfig, type BattleConfig, type BattleLog } from "@cellstorm/sim";
import { DEFAULT_HUD } from "@cellstorm/render/hud-config";
import { bundlePageScript, MASTER_WIDTH, MASTER_HEIGHT } from "./renderBattle";
import { resolveFfmpegBin } from "./encode";

// Fixed "random" fights — chosen once and reused for every label so comparisons are apples-to-apples.
// Picked for variety: mixed archetypes/shapes, FX-heavy powers (explosions/shatter/projectiles/heals),
// a 6-team color spread, and fast movers (good trails).
export interface Fight {
  name: string;
  seed: number;
  teamCount: number;
  powers: string[];
}
export const DEFAULT_FIGHTS: Fight[] = [
  { name: "f1-mixed", seed: 4012, teamCount: 4, powers: ["Berserker", "Tank", "Splitter", "Plague"] },
  { name: "f2-fx", seed: 8821, teamCount: 4, powers: ["Bomb", "Glasshammer", "Sniper", "Vampire"] },
  { name: "f3-swarm", seed: 1507, teamCount: 6, powers: ["Berserker", "Swift", "Charger", "Frenzy", "Stunner", "Brute"] },
];

// Fractions of the fight length to sample, plus one auto-detected peak-action tick (see peakTick).
const FRACTIONS = [0.4, 0.6, 0.8];

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#000;overflow:hidden}
  #wrap{position:relative;display:inline-block;line-height:0}
  canvas{display:block}
  #hud{position:absolute;inset:0}
</style></head><body><div id="wrap"><canvas id="stage"></canvas><div id="hud"></div></div></body></html>`;

export interface ShotsArgs {
  out?: string;
  label?: string;
  scale?: string;
  ss?: string;
  warmup?: string;
  hud?: boolean;
}

export function parseShotsArgs(argv: string[]): ShotsArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      out: { type: "string" },
      label: { type: "string" },
      scale: { type: "string" },
      ss: { type: "string" },
      warmup: { type: "string" },
      hud: { type: "boolean" },
    },
  });
  return values as ShotsArgs;
}

/** Tick with the densest deaths in a +/-window — a reliable "lots happening" frame. */
export function peakTick(log: BattleLog, fightLen: number, window = 18): number {
  const deaths = new Array(fightLen + 1).fill(0);
  for (const e of log.events) {
    if (e.type === "death" && e.tick >= 0 && e.tick <= fightLen) deaths[e.tick]++;
  }
  let best = Math.round(fightLen * 0.6);
  let bestSum = -1;
  for (let t = 0; t <= fightLen; t++) {
    let sum = 0;
    for (let d = -window; d <= window; d++) {
      const i = t + d;
      if (i >= 0 && i <= fightLen) sum += deaths[i];
    }
    if (sum > bestSum) { bestSum = sum; best = t; }
  }
  return best;
}

/** The ticks to screenshot for a fight: 3 fractions + the peak, deduped, clamped, sorted. */
export function pickTicks(log: BattleLog, frameCount: number): number[] {
  const fightLen = Math.min(log.durationTicks, frameCount - 1);
  const ticks = FRACTIONS.map((f) => Math.round(f * fightLen));
  ticks.push(peakTick(log, fightLen));
  const clamped = ticks.map((t) => Math.max(0, Math.min(frameCount - 1, t)));
  return [...new Set(clamped)].sort((a, b) => a - b);
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "ignore"] });
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

async function main(argv: string[]): Promise<void> {
  const args = parseShotsArgs(argv);
  if (!args.out) throw new Error("--out <dir> is required");
  const label = args.label ?? "shots";
  const scale = args.scale ? Number(args.scale) : 0.5;
  const ss = args.ss ? Number(args.ss) : 1;
  const warmup = args.warmup ? Number(args.warmup) : 14;
  const hudHidden = !args.hud; // HUD hidden by default so stills show pure battle visuals
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`--scale must be > 0`);
  if (!Number.isFinite(ss) || ss < 1) throw new Error(`--ss must be >= 1`);

  const outW = Math.max(2, Math.round((MASTER_WIDTH * scale) / 2) * 2); // even
  const outH = Math.round((outW * MASTER_HEIGHT) / MASTER_WIDTH);
  const renderW = Math.round(outW * ss);
  const renderH = Math.round(outH * ss);

  const outDir = join(args.out, label);
  mkdirSync(outDir, { recursive: true });
  const tmp = ss > 1 ? join(tmpdir(), `cellstorm-shot-${process.pid}.png`) : null;
  const ffmpeg = ss > 1 ? resolveFfmpegBin() : null;

  process.stdout.write(
    `shots: label=${label} out=${outW}x${outH} render=${renderW}x${renderH} ss=${ss} -> ${outDir}\n`,
  );

  const pageScript = await bundlePageScript();
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  let written = 0;
  try {
    for (const fight of DEFAULT_FIGHTS) {
      const config: BattleConfig = normalizeConfig({ seed: fight.seed, teamCount: fight.teamCount, powers: fight.powers });
      const { log, frames } = captureFrames(config);
      const framesB64 = Buffer.from(packFrames(frames)).toString("base64");
      const ticks = pickTicks(log, frames.length);

      const page = await browser.newPage({ viewport: { width: renderW, height: renderH } });
      await page.setContent(PAGE_HTML, { waitUntil: "load" });
      await page.addScriptTag({ content: pageScript });
      await page.evaluate(
        async (a) => { await window.__cellstorm.init(a); },
        { config, hud: DEFAULT_HUD, width: renderW, height: renderH, framesB64, events: log.events },
      );

      for (const tick of ticks) {
        // Warm up a short window so cosmetic FX (bursts/flashes/trails) are present in the still.
        const start = Math.max(0, tick - warmup);
        await page.evaluate((a) => window.__cellstorm.drawFrame(a.i, a.h, true), { i: start, h: hudHidden });
        for (let i = start + 1; i <= tick; i++) {
          await page.evaluate((a) => window.__cellstorm.drawFrame(a.i, a.h, false), { i, h: hudHidden });
        }
        const dest = join(outDir, `${fight.name}_t${String(tick).padStart(5, "0")}.png`);
        if (tmp && ffmpeg) {
          await page.screenshot({ path: tmp });
          await runFfmpeg(ffmpeg, ["-y", "-i", tmp, "-vf", `scale=${outW}:${outH}:flags=lanczos`, dest]);
        } else {
          await page.screenshot({ path: dest });
        }
        written++;
      }
      await page.close();
      process.stdout.write(`  ${fight.name}: ${ticks.length} stills (ticks ${ticks.join(",")})\n`);
    }
  } finally {
    await browser.close();
    if (tmp) rmSync(tmp, { force: true });
  }
  process.stdout.write(`Done: ${written} stills -> ${outDir}\n`);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
