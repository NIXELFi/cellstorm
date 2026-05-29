// Selectable arena backgrounds. Replaces the flat fill with subtle, dark patterns (dots, hex lattice,
// or both) that sit behind everything. Drawn into the scene's trail/clear Graphics at the SAME low
// alpha as the old flat fill, so the motion-trail fade is preserved and the pattern simply becomes
// what cells fade toward. Pure procedural geometry — NO Math.random / wall-clock; animation is driven
// by the deterministic sim TICK, so every engine renders the identical background (determinism-safe,
// cosmetic only). Features are sized in OUTPUT pixels so they look the same at 280px preview and 4K.

import type { Graphics } from "pixi.js";
import type { Theme } from "./theme";

// Dim cool-tone pattern colors that read against the near-black neon field without competing.
const IND = 0x2a2150; // indigo
const INDB = 0x3b2e72; // brighter indigo
const CYAN = 0x1f6b78; // dim cyan
const WARM = 0x4a3520; // dim amber
const VIO = 0x46276b; // violet

interface DotsCfg { stepDiv: number; rFrac: number; color: number; alpha: number; }
interface HexCfg { rDiv: number; lwFrac: number; color: number; alpha: number; }
type Anim =
  | { kind: "drift"; dx: number; dy: number } // pattern scrolls (units/tick)
  | { kind: "pulse"; amp: number; period: number } // brightness breathes
  | { kind: "twinkle"; period: number } // per-dot brightness shimmer
  | { kind: "parallax"; dotsDx: number; hexDx: number }; // dots & hex drift at different rates
interface Preset { dots?: DotsCfg; hex?: HexCfg; anim?: Anim; }

// "hella options": tuned static variants of dots, hex, and dots+hex combos, plus a few animated ones.
const PRESETS: Record<string, Preset> = {
  flat: {},

  // --- dots: vary density / size / brightness / color ---
  "dots-fine": { dots: { stepDiv: 22, rFrac: 0.06, color: IND, alpha: 0.5 } },
  "dots-med": { dots: { stepDiv: 14, rFrac: 0.06, color: IND, alpha: 0.55 } },
  "dots-coarse": { dots: { stepDiv: 9, rFrac: 0.08, color: IND, alpha: 0.6 } },
  "dots-bright": { dots: { stepDiv: 14, rFrac: 0.07, color: INDB, alpha: 0.95 } },
  "dots-cyan": { dots: { stepDiv: 14, rFrac: 0.06, color: CYAN, alpha: 0.6 } },
  "dots-warm": { dots: { stepDiv: 14, rFrac: 0.06, color: WARM, alpha: 0.6 } },

  // --- hex lattice: vary size / weight / brightness / color ---
  "hex-small": { hex: { rDiv: 14, lwFrac: 0.0015, color: IND, alpha: 0.3 } },
  "hex-med": { hex: { rDiv: 9, lwFrac: 0.0015, color: IND, alpha: 0.32 } },
  "hex-large": { hex: { rDiv: 6, lwFrac: 0.0013, color: IND, alpha: 0.34 } },
  "hex-bright": { hex: { rDiv: 9, lwFrac: 0.002, color: INDB, alpha: 0.6 } },
  "hex-cyan": { hex: { rDiv: 9, lwFrac: 0.0016, color: CYAN, alpha: 0.42 } },

  // --- combo: dots + hex together (the requested combination, several balances) ---
  "combo-soft": { dots: { stepDiv: 18, rFrac: 0.06, color: IND, alpha: 0.4 }, hex: { rDiv: 7, lwFrac: 0.0012, color: IND, alpha: 0.22 } },
  "combo-med": { dots: { stepDiv: 14, rFrac: 0.06, color: IND, alpha: 0.5 }, hex: { rDiv: 9, lwFrac: 0.0014, color: IND, alpha: 0.3 } },
  "combo-bold": { dots: { stepDiv: 12, rFrac: 0.07, color: INDB, alpha: 0.85 }, hex: { rDiv: 8, lwFrac: 0.0018, color: INDB, alpha: 0.5 } },
  "combo-cyan": { dots: { stepDiv: 14, rFrac: 0.06, color: CYAN, alpha: 0.55 }, hex: { rDiv: 9, lwFrac: 0.0014, color: IND, alpha: 0.3 } },
  "combo-dotsbig": { dots: { stepDiv: 22, rFrac: 0.05, color: IND, alpha: 0.45 }, hex: { rDiv: 5.5, lwFrac: 0.0012, color: VIO, alpha: 0.26 } },

  // --- animated (tick-driven, deterministic) ---
  "anim-drift": { dots: { stepDiv: 14, rFrac: 0.06, color: IND, alpha: 0.5 }, hex: { rDiv: 9, lwFrac: 0.0014, color: IND, alpha: 0.3 }, anim: { kind: "drift", dx: 0.00045, dy: 0.0003 } },
  "anim-pulse": { dots: { stepDiv: 14, rFrac: 0.06, color: INDB, alpha: 0.55 }, hex: { rDiv: 9, lwFrac: 0.0015, color: INDB, alpha: 0.32 }, anim: { kind: "pulse", amp: 0.55, period: 150 } },
  "anim-twinkle": { dots: { stepDiv: 13, rFrac: 0.07, color: INDB, alpha: 0.7 }, hex: { rDiv: 9, lwFrac: 0.0014, color: IND, alpha: 0.26 }, anim: { kind: "twinkle", period: 90 } },
  // combo-cyan's look (cyan dots + indigo hex), dialed up to be more prevalent, with the two layers
  // drifting opposite directions for depth. This is the project default (see scene.ts).
  "anim-parallax": { dots: { stepDiv: 14, rFrac: 0.075, color: CYAN, alpha: 0.9 }, hex: { rDiv: 9, lwFrac: 0.0019, color: INDB, alpha: 0.55 }, anim: { kind: "parallax", dotsDx: 0.0008, hexDx: -0.00035 } },
};

export type BackgroundStyle = keyof typeof PRESETS;
export const BACKGROUND_STYLES: string[] = Object.keys(PRESETS);
export function resolveBackgroundStyle(s?: string): string {
  return s && s in PRESETS ? s : "flat";
}

const TAU = Math.PI * 2;
const wrap = (v: number, m: number) => ((v % m) + m) % m;

function drawDots(g: Graphics, w: number, h: number, unit: number, cfg: DotsCfg, gAlpha: number, ox: number, oy: number, twinkleT: number | null): void {
  const step = unit / cfg.stepDiv;
  const r = Math.max(1, step * cfg.rFrac);
  const startX = step / 2 - wrap(ox, step) - step;
  const startY = step / 2 - wrap(oy, step) - step;
  let iy = 0;
  for (let y = startY; y < h + step; y += step, iy++) {
    let ix = 0;
    for (let x = startX; x < w + step; x += step, ix++) {
      let alpha = cfg.alpha * gAlpha;
      if (twinkleT !== null) {
        const phase = (ix * 0.7 + iy * 1.3);
        alpha *= 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(twinkleT + phase));
      }
      if (alpha > 0.003) g.circle(x, y, r).fill({ color: cfg.color, alpha });
    }
  }
}

function drawHex(g: Graphics, w: number, h: number, unit: number, cfg: HexCfg, gAlpha: number, ox: number, oy: number): void {
  const R = unit / cfg.rDiv;
  const hw = Math.sqrt(3) * R; // pointy-top hex width
  const vert = 1.5 * R; // row spacing
  const lw = Math.max(1, unit * cfg.lwFrac);
  const alpha = cfg.alpha * gAlpha;
  if (alpha <= 0.003) return;
  const oxw = wrap(ox, hw);
  const oyw = wrap(oy, vert * 2);
  let row = 0;
  for (let cy = -vert * 2 + oyw; cy <= h + R; cy += vert, row++) {
    const rowOff = (row % 2 ? hw / 2 : 0) - oxw;
    for (let cx = -hw + rowOff; cx <= w + hw; cx += hw) {
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 180) * (60 * i - 30);
        pts.push(cx + R * Math.cos(ang), cy + R * Math.sin(ang));
      }
      g.poly(pts).stroke({ width: lw, color: cfg.color, alpha });
    }
  }
}

/**
 * Draw the background into `g` over the w×h arena. `alpha` scales every fill (scene passes 1 for the
 * opaque first frame, 0.5 for the per-frame trail/clear pass). `tick` drives animated presets (the
 * deterministic sim frame), so motion is identical headless and live.
 */
export function drawBackground(g: Graphics, style: string, w: number, h: number, theme: Theme, alpha = 1, tick = 0): void {
  g.rect(0, 0, w, h).fill({ color: theme.background, alpha });
  const preset = PRESETS[resolveBackgroundStyle(style)]!;
  const unit = Math.min(w, h);

  let gAlpha = alpha;
  let dotsOx = 0, dotsOy = 0, hexOx = 0, hexOy = 0;
  let twinkleT: number | null = null;
  const a = preset.anim;
  if (a?.kind === "drift") { dotsOx = hexOx = a.dx * unit * tick; dotsOy = hexOy = a.dy * unit * tick; }
  else if (a?.kind === "parallax") { dotsOx = a.dotsDx * unit * tick; hexOx = a.hexDx * unit * tick; }
  else if (a?.kind === "pulse") { gAlpha = alpha * (1 + a.amp * Math.sin((TAU * tick) / a.period)); }
  else if (a?.kind === "twinkle") { twinkleT = (TAU * tick) / a.period; }
  gAlpha = Math.max(0, gAlpha);

  if (preset.hex) drawHex(g, w, h, unit, preset.hex, gAlpha, hexOx, hexOy);
  if (preset.dots) drawDots(g, w, h, unit, preset.dots, gAlpha, dotsOx, dotsOy, twinkleT);
}
