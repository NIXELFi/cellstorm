// PURE safe-area model for the 1080x1920 (9:16) Shorts frame. The actually-visible-and-unobstructed
// region on a real iPhone in the Shorts app is much smaller than the raw frame: the notch / Dynamic
// Island eats the top, the action-button column eats the right, and the caption/channel/sound/progress
// strip eats the bottom. ALL HUD/text must live inside the derived safe rect.
//
// Insets are in px against the 1080x1920 master; the HUD positions via PERCENTAGES (its container is
// the full canvas), so the same constants are correct at preview AND render resolution. Tune on-device.
// No DOM/Pixi imports — shared by cssHud (positioning + debug overlay) and scene (action zoom), and
// unit-tested.

export const MASTER_W = 1080;
export const MASTER_H = 1920;

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Conservative starting insets — fine-tune on a real device with the debug overlay. */
export const SAFE_AREA: SafeAreaInsets = {
  top: 180, // status bar + notch / Dynamic Island clearance
  bottom: 400, // caption + channel name + sound row + progress/seek bar + nav
  right: 200, // action button column: like / comment / share / remix / sound
  left: 40, // small breathing margin
};

/**
 * Render-side inward scale of the drawn battle so the meaningful action lands inside the safe zone.
 * 0 = OFF (full-bleed, the battle maps 1:1 to the frame exactly as before — sim/visuals unchanged).
 * 1 = the whole frame's action is scaled to fit entirely within the safe rect (centered on it).
 * This is a COMPOSITING transform only; it never touches the sim, so outcomes stay bit-identical.
 */
export const ACTION_ZOOM = 0;

export interface SafeInsetPct {
  topPct: number;
  bottomPct: number;
  leftPct: number;
  rightPct: number;
}

/** Insets as percentages of the master frame, for CSS positioning (top/bottom = % of height, etc.). */
export function safeInsetPct(insets: SafeAreaInsets = SAFE_AREA): SafeInsetPct {
  return {
    topPct: (insets.top / MASTER_H) * 100,
    bottomPct: (insets.bottom / MASTER_H) * 100,
    leftPct: (insets.left / MASTER_W) * 100,
    rightPct: (insets.right / MASTER_W) * 100,
  };
}

export interface SafeRect {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

/** The safe rectangle in master px. */
export function safeRect(insets: SafeAreaInsets = SAFE_AREA): SafeRect {
  const x = insets.left;
  const y = insets.top;
  const w = MASTER_W - insets.left - insets.right;
  const h = MASTER_H - insets.top - insets.bottom;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

export interface SafeFit {
  /** Largest uniform scale that fits the full frame's content within the safe rect. */
  fitScale: number;
  /** Safe-zone center as a fraction of the frame (0..1). */
  cxFrac: number;
  cyFrac: number;
}

/** Geometry for the action zoom: the fit scale + the safe-zone center (as frame fractions). */
export function safeFit(insets: SafeAreaInsets = SAFE_AREA): SafeFit {
  const r = safeRect(insets);
  return {
    fitScale: Math.min(r.w / MASTER_W, r.h / MASTER_H),
    cxFrac: r.cx / MASTER_W,
    cyFrac: r.cy / MASTER_H,
  };
}

/**
 * The scene transform (scale + canvas-px offset) for a given action-zoom amount, lerped from identity
 * (zoom 0 → scale 1, offset 0,0 — exactly full-bleed) toward the safe-fit (zoom 1). Pure; the caller
 * passes the canvas size and applies the result to the scene container.
 */
export function actionTransform(
  canvasW: number,
  canvasH: number,
  zoom: number = ACTION_ZOOM,
  insets: SafeAreaInsets = SAFE_AREA,
): { scale: number; x: number; y: number } {
  const z = zoom < 0 ? 0 : zoom > 1 ? 1 : zoom;
  if (z === 0) return { scale: 1, x: 0, y: 0 };
  const { fitScale, cxFrac, cyFrac } = safeFit(insets);
  const scale = 1 + (fitScale - 1) * z;
  const x = canvasW * (cxFrac - 0.5 * fitScale) * z;
  const y = canvasH * (cyFrac - 0.5 * fitScale) * z;
  return { scale, x, y };
}
