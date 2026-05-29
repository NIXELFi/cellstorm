// Pure layout math for the bracket. Positions are computed inside a bounding REGION (output px), so the
// same code lays out the full-frame bracket scenes AND a scaled-down mini-bracket inside a side panel.
// Five columns left→right (ro16, qf, sf, final, champion); each round's competitors evenly stacked.
import type { Round } from "../types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** The box the bracket is laid out within (full frame, or a side-panel rect). */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

const COLS: Round[] = ["ro16", "qf", "sf", "final"];
const COUNT: Record<Round, number> = { ro16: 16, qf: 8, sf: 4, final: 2 };
const TOTAL_COLS = 5; // the four rounds + a champion column

const BAND_TOP = 0.16;
const BAND_BOT = 0.95;
const PAD_X = 0.018;

function cellRect(col: number, index: number, count: number, r: Region): Rect {
  const colW = (r.w - r.w * PAD_X * 2) / TOTAL_COLS;
  const x = r.x + r.w * PAD_X + col * colW;
  const cellH = (r.h * (BAND_BOT - BAND_TOP)) / count;
  const cy = r.y + r.h * BAND_TOP + cellH * (index + 0.5);
  const boxH = Math.min(cellH * 0.72, r.h * 0.045);
  return { x: x + colW * 0.05, y: cy - boxH / 2, w: colW * 0.9, h: boxH };
}

/** Box for one competitor: column by round, row by global competitor index (matchIndex*2 + side). */
export function competitorRect(round: Round, matchIndex: number, side: 0 | 1, r: Region): Rect {
  return cellRect(COLS.indexOf(round), matchIndex * 2 + side, COUNT[round], r);
}

export function championRect(r: Region): Rect {
  return cellRect(4, 0, 1, r);
}
