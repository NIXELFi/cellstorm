import { GRID_SIZE, type World } from "../world";
import { applyDamage } from "./damage";
import type { EventSink } from "../events";

/**
 * Moves projectiles, resolves projectile-cell hits, then resolves cell-cell
 * overlap (positional push + cross-team melee damage with charge burst).
 */
export function collisionSystem(w: World, sink: EventSink): void {
  const { width: W, height: H } = w.cfg.arena;

  // Projectile movement + collision.
  for (let pi = w.projectiles.length - 1; pi >= 0; pi--) {
    const proj = w.projectiles[pi]!;
    proj.x += proj.vx; proj.y += proj.vy;
    proj.life--;
    if (proj.life <= 0 || proj.x < 0 || proj.x > W || proj.y < 0 || proj.y > H) {
      w.projectiles.splice(pi, 1);
      continue;
    }
    const gx = Math.floor(proj.x / GRID_SIZE);
    const gy = Math.floor(proj.y / GRID_SIZE);
    let hit = false;
    for (let dgy = -1; dgy <= 1 && !hit; dgy++) {
      for (let dgx = -1; dgx <= 1 && !hit; dgx++) {
        const ngx = gx + dgx, ngy = gy + dgy;
        if (ngx < 0 || ngx >= w.gw || ngy < 0 || ngy >= w.gh) continue;
        const list = w.grid[ngy * w.gw + ngx]!;
        for (const idx of list) {
          const o = w.cells[idx]!;
          if (!o.alive || o.team === proj.team) continue;
          const dx = o.x - proj.x, dy = o.y - proj.y;
          if (dx * dx + dy * dy < (o.radius + 2) * (o.radius + 2)) {
            applyDamage(w, sink, null, o, proj.damage);
            hit = true;
            break;
          }
        }
      }
    }
    if (hit) w.projectiles.splice(pi, 1);
  }

  // Cell-cell overlap resolution + melee damage.
  for (let i = 0; i < w.cells.length; i++) {
    const c = w.cells[i]!;
    if (!c.alive) continue;
    const gx = Math.floor(c.x / GRID_SIZE);
    const gy = Math.floor(c.y / GRID_SIZE);
    for (let dgy = -1; dgy <= 1; dgy++) {
      for (let dgx = -1; dgx <= 1; dgx++) {
        const ngx = gx + dgx, ngy = gy + dgy;
        if (ngx < 0 || ngx >= w.gw || ngy < 0 || ngy >= w.gh) continue;
        const list = w.grid[ngy * w.gw + ngx]!;
        for (const j of list) {
          if (j <= i) continue;
          const o = w.cells[j]!;
          if (!o.alive) continue;
          const dx = o.x - c.x, dy = o.y - c.y;
          const d2 = dx * dx + dy * dy;
          const sumR = c.radius + o.radius;
          if (d2 < sumR * sumR && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const ov = sumR - d;
            const nx = dx / d, ny = dy / d;
            c.x -= nx * ov * 0.5; c.y -= ny * ov * 0.5;
            o.x += nx * ov * 0.5; o.y += ny * ov * 0.5;
            if (c.team !== o.team) {
              const pC = w.teamPowers[c.team]!;
              const pO = w.teamPowers[o.team]!;
              let baseC = 1.4;
              let baseO = 1.4;
              if (pC.charge && c.dash > 0) baseC = pC.chargeBurst!;
              if (pO.charge && o.dash > 0) baseO = pO.chargeBurst!;
              c.vx -= nx * 0.4; c.vy -= ny * 0.4;
              o.vx += nx * 0.4; o.vy += ny * 0.4;
              applyDamage(w, sink, c, o, baseC);
              if (c.alive) applyDamage(w, sink, o, c, baseO);
            }
          }
        }
      }
    }
  }
}
