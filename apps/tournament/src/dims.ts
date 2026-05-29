// Canonical output/capture dimensions, computed ONCE and fed to both the battle render (renderBattle)
// and the scene renders so every segment is byte-for-byte the same size — a precondition for clean
// `ffmpeg -f concat -c copy`. Uses the renderer's MASTER_* constants and the SAME even()/aspect math
// as renderBattle (libx264 needs even dims; the 9:16 master aspect is preserved at any scale).
import { MASTER_WIDTH, MASTER_HEIGHT } from "@cellstorm/renderer";

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export interface Dims {
  /** Final output size (after any supersample downscale). */
  width: number;
  height: number;
  /** Size the PNG frames are captured at (= output when supersample is 1). */
  renderWidth: number;
  renderHeight: number;
}

export function canonicalDims(o: { scale: number; supersample: number }): Dims {
  const width = even(MASTER_WIDTH * o.scale);
  const height = even((width * MASTER_HEIGHT) / MASTER_WIDTH);
  const ss = o.supersample > 0 ? o.supersample : 1;
  const renderWidth = even(width * ss);
  const renderHeight = even((renderWidth * MASTER_HEIGHT) / MASTER_WIDTH);
  return { width, height, renderWidth, renderHeight };
}
