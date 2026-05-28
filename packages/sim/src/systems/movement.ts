import { type World } from "../world";
import type { Cell } from "../types";

/** Wall bounce: clamp position to arena bounds and reflect velocity inward. */
function clampToArena(c: Cell, W: number, H: number): void {
  if (c.x < c.radius) { c.x = c.radius; c.vx = Math.abs(c.vx); }
  if (c.x > W - c.radius) { c.x = W - c.radius; c.vx = -Math.abs(c.vx); }
  if (c.y < c.radius) { c.y = c.radius; c.vy = Math.abs(c.vy); }
  if (c.y > H - c.radius) { c.y = H - c.radius; c.vy = -Math.abs(c.vy); }
}

/**
 * Per-cell movement: applies state-driven steering forces, then integrates
 * velocity/position with damping, velocity cap (x1.5 while dashing), and wall
 * bounce. Stunned cells skip steering and integrate with stronger damping.
 * AI decisions and ability velocity changes are handled in step.ts / abilities.
 */
export function movementSystem(w: World): void {
  const { width: W, height: H } = w.cfg.arena;
  const ai = w.cfg.ai;
  for (let i = 0; i < w.cells.length; i++) {
    const c = w.cells[i]!;
    if (!c.alive) continue;
    const p = w.teamPowers[c.team]!;
    const speedMult = p.speed ?? 1;

    if (c.stunT > 0) {
      c.stunT--;
      c.vx *= 0.82; c.vy *= 0.82;
      c.x += c.vx; c.y += c.vy;
      clampToArena(c, W, H);
      continue;
    }

    const state = c.state;
    if (state === "engage" && c.tx !== null) {
      const dx = c.tx - c.x, dy = c.ty! - c.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const f = (p.aggro ? ai.aggroEngageForce : ai.engageForce) * speedMult;
      c.vx += (dx / d) * f;
      c.vy += (dy / d) * f;
    } else if (state === "retreat" && c.acx !== null) {
      const dx = c.acx - c.x, dy = c.acy! - c.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      c.vx += (dx / d) * 0.32 * speedMult;
      c.vy += (dy / d) * 0.32 * speedMult;
      if (c.tx !== null) {
        const ex = c.x - c.tx, ey = c.y - c.ty!;
        const ed = Math.sqrt(ex * ex + ey * ey) + 0.01;
        c.vx += (ex / ed) * 0.18 * speedMult;
        c.vy += (ey / ed) * 0.18 * speedMult;
      }
    } else if (state === "regroup" && c.acx !== null) {
      const dx = c.acx - c.x, dy = c.acy! - c.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      c.vx += (dx / d) * 0.20 * speedMult;
      c.vy += (dy / d) * 0.20 * speedMult;
    } else {
      // hunt: no enemy in perception. Wander randomly, optionally biased toward the arena
      // center so late-game survivors converge instead of drifting apart (anti-stalemate).
      c.vx += (w.prng() - 0.5) * 0.35 * speedMult;
      c.vy += (w.prng() - 0.5) * 0.35 * speedMult;
      if (ai.huntCenterBias > 0) {
        const dx = W / 2 - c.x, dy = H / 2 - c.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        c.vx += (dx / d) * ai.huntCenterBias * speedMult;
        c.vy += (dy / d) * ai.huntCenterBias * speedMult;
      }
    }
    if (c.acx !== null && state !== "retreat") {
      c.vx += (c.avx - c.vx) * ai.flockWeight;
      c.vy += (c.avy - c.vy) * ai.flockWeight;
    }

    c.x += c.vx; c.y += c.vy;
    c.vx *= 0.93; c.vy *= 0.93;
    const vm2 = c.vx * c.vx + c.vy * c.vy;
    const vmax = 2.6 * speedMult * (c.dash > 0 ? 1.5 : 1);
    if (vm2 > vmax * vmax) {
      const s = vmax / Math.sqrt(vm2);
      c.vx *= s; c.vy *= s;
    }
    clampToArena(c, W, H);
  }
}
