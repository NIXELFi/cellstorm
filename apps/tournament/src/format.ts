// Long-form output is 16:9 LANDSCAPE (the Shorts pipeline stays 9:16 portrait, untouched). The portrait
// battle clip is composited centered into the landscape frame; the side gutters carry broadcast panels
// (matchup + mini-bracket + score + seed ID). These dims/rects are pure output-pixel geometry; the
// actual pixels are drawn by the scenes (sceneEntry) and the ffmpeg overlay (renderMatch).
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

// 16:9 4K landscape master. Test renders scale this down (e.g. --scale 0.3333 -> 1280x720).
export const LANDSCAPE_MASTER_W = 3840;
export const LANDSCAPE_MASTER_H = 2160;

export interface FrameDims {
  width: number;
  height: number;
  /** Capture size; equals output in landscape v1 (no supersample). */
  renderWidth: number;
  renderHeight: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameLayout {
  /** Full-width title bar across the top. */
  title: Rect;
  /** Centered portrait box the battle clip is overlaid into (below the title bar). */
  battle: Rect;
  /** Left gutter — matchup card. */
  leftPanel: Rect;
  /** Right gutter — mini-bracket / score. */
  rightPanel: Rect;
}

/** 16:9 output dimensions for a given scale (fraction of the 3840-wide master). */
export function frameDims(scale: number): FrameDims {
  const width = even(LANDSCAPE_MASTER_W * scale);
  const height = even((width * 9) / 16);
  return { width, height, renderWidth: width, renderHeight: height };
}

/** Title-bar height as a fraction of frame height. */
export const TITLE_FRAC = 0.1;

/**
 * Output-pixel rectangles for a match frame. The battle box sits BELOW the title bar, full remaining
 * height, centered; the panels flank it in the gutters. The composite ffmpeg-scales the battle to the
 * battle box, so the exact battle render size only needs to be close (see battleRenderWidth).
 */
export function frameLayout(d: FrameDims): FrameLayout {
  const W = d.width;
  const H = d.height;
  const titleH = Math.round(H * TITLE_FRAC);
  const contentH = H - titleH;
  const battleW = even(Math.round((contentH * 9) / 16));
  const battleX = Math.round((W - battleW) / 2);
  const pad = Math.round(W * 0.012);
  return {
    title: { x: 0, y: 0, w: W, h: titleH },
    battle: { x: battleX, y: titleH, w: battleW, h: contentH },
    leftPanel: { x: pad, y: titleH + pad, w: battleX - pad * 2, h: contentH - pad * 2 },
    rightPanel: { x: battleX + battleW + pad, y: titleH + pad, w: W - (battleX + battleW) - pad * 2, h: contentH - pad * 2 },
  };
}

/** Portrait battle render width whose derived 9:16 height ≈ the battle box height (the composite then
 *  scales to the exact box height, so rounding here is harmless). */
export function battleRenderWidth(d: FrameDims): number {
  const titleH = Math.round(d.height * TITLE_FRAC);
  const contentH = d.height - titleH;
  return even(Math.round((contentH * 9) / 16));
}
