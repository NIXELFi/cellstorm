// Population-over-time sparkline: draws per-team alive-count lines on a small canvas. The data
// reduction is pure (logLogic.sparklineData); this module only paints it.

import type { BattleLog } from "@cellstorm/sim";
import { THEME, teamColor } from "@cellstorm/render";
import { sparklineData } from "./logLogic";

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** Draw the population timeline of `log` onto `canvas`. */
export function drawSparkline(canvas: HTMLCanvasElement, log: BattleLog): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0d0a16";
  ctx.fillRect(0, 0, w, h);

  const { series, max, length } = sparklineData(log, w);
  if (length < 2 || max <= 0) return;

  const pad = 2;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2;

  for (let t = 0; t < series.length; t++) {
    const line = series[t]!;
    ctx.beginPath();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = hex(teamColor(THEME, t));
    for (let i = 0; i < line.length; i++) {
      const x = pad + (i / (length - 1)) * plotW;
      const y = pad + plotH - (line[i]! / max) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
