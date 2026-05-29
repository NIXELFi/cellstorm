// Team/slot colors. A pure, Node- AND browser-safe copy of @cellstorm/render THEME.teams[].color, so
// the esbuild scene bundle doesn't have to pull the render root export (which drags in pixi.js, and
// pixi touches `navigator` at module load — unusable Node-side). Slot 0 = Red (team 0), slot 1 = Blue
// (team 1), matching the unmodified battle renderer, so the bracket reads identically to the clips.
// NOTE: kept in sync with @cellstorm/render/theme.ts by hand; a pure theme subpath would let us dedupe.
export const TEAM_COLORS: readonly number[] = [
  0xff5066, // Red
  0x5099ff, // Blue
  0xffcc40, // Gold
  0x4ade80, // Green
  0xc084fc, // Purple
  0x22d3ee, // Cyan
];

export const PODIUM_COLORS = { gold: 0xffcc40, silver: 0xc8d2e0, bronze: 0xcd7f32 } as const;

/** Field/page background, mirroring THEME.background / pageBackground. */
export const BG_FIELD = 0x050008;
export const BG_PAGE = 0x08070d;

/** Color for a slot index (wraps the palette, like teamColor()). */
export function slotColor(slot: number): number {
  return TEAM_COLORS[slot % TEAM_COLORS.length]!;
}

/** 0xRRGGBB number -> "#rrggbb" CSS string. */
export function cssHex(n: number): string {
  return `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;
}
