import { GRID_SIZE, makeCell, type World } from "../world";
import { handleDeath } from "./damage";
import type { EventSink } from "../events";

/**
 * Status ticks (plague, regen) plus active abilities (shoot, charge, revive,
 * lifebloom aura) for non-stunned cells, followed by the team-wide magnet pull
 * pass. Stunned cells are skipped this frame (movement handles their drift).
 */
export function abilitiesSystem(w: World, sink: EventSink): void {
  for (let i = 0; i < w.cells.length; i++) {
    const c = w.cells[i]!;
    if (!c.alive || c.stunT > 0) continue;
    const p = w.teamPowers[c.team]!;

    if (c.plagueT > 0) {
      c.plagueT--;
      c.hp -= 0.07;
      if (c.hp <= 0) { handleDeath(w, sink, c, null); continue; }
    }
    if (p.regen && c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + p.regen);

    if (p.shoot) {
      if (c.cdShoot > 0) c.cdShoot--;
      else if (c.tx !== null) {
        const dx = c.tx - c.x, dy = c.ty! - c.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 95 && d > 6) {
          w.projectiles.push({
            x: c.x, y: c.y,
            vx: (dx / d) * p.projSpeed!,
            vy: (dy / d) * p.projSpeed!,
            team: c.team,
            damage: p.projDamage!,
            life: 28,
          });
          c.cdShoot = p.shootCD!;
          sink.fire(c.team);
        }
      }
    }

    if (p.charge) {
      if (c.cdCharge > 0) c.cdCharge--;
      else if (c.tx !== null) {
        const dx = c.tx - c.x, dy = c.ty! - c.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 40 && d > 4) {
          c.vx += (dx / d) * p.chargeForce!;
          c.vy += (dy / d) * p.chargeForce!;
          c.dash = 10;
          c.cdCharge = p.chargeCD!;
        }
      }
    }
    if (c.dash > 0) c.dash--;

    if (p.revive) {
      if (c.cdRevive > 0) c.cdRevive--;
      else {
        for (let k = w.corpses.length - 1; k >= 0; k--) {
          const cp = w.corpses[k]!;
          if (cp.team !== c.team) continue;
          const dx = cp.x - c.x, dy = cp.y - c.y;
          if (dx * dx + dy * dy < 60 * 60) {
            if (w.cells.length + w.pending.length < 1500) {
              const n = makeCell(w, c.team, cp.x, cp.y);
              n.hp = n.maxHp * 0.5;
              w.pending.push(n);
              w.corpses.splice(k, 1);
              c.cdRevive = p.reviveCD!;
              break;
            }
          }
        }
      }
    }

    if (p.auraHeal && w.frame % 4 === 0) {
      const gx = Math.floor(c.x / GRID_SIZE);
      const gy = Math.floor(c.y / GRID_SIZE);
      const aR2 = p.auraR! * p.auraR!;
      for (let dgy = -3; dgy <= 3; dgy++) {
        for (let dgx = -3; dgx <= 3; dgx++) {
          const ngx = gx + dgx, ngy = gy + dgy;
          if (ngx < 0 || ngx >= w.gw || ngy < 0 || ngy >= w.gh) continue;
          const list = w.grid[ngy * w.gw + ngx]!;
          for (const idx of list) {
            const o = w.cells[idx]!;
            if (!o.alive || o.team !== c.team || o === c) continue;
            const dx = o.x - c.x, dy = o.y - c.y;
            if (dx * dx + dy * dy < aR2) {
              o.hp = Math.min(o.maxHp, o.hp + p.auraHeal!);
            }
          }
        }
      }
    }
  }

  // Magnet pull pass: each magnet team pulls nearby enemies toward its cells.
  for (let t = 0; t < w.cfg.teamCount; t++) {
    const pT = w.teamPowers[t]!;
    if (!pT.pull) continue;
    const pR2 = pT.pullR! * pT.pullR!;
    const win = Math.ceil(pT.pullR! / GRID_SIZE);
    for (let i = 0; i < w.cells.length; i++) {
      const m = w.cells[i]!;
      if (!m.alive || m.team !== t) continue;
      const gx = Math.floor(m.x / GRID_SIZE);
      const gy = Math.floor(m.y / GRID_SIZE);
      for (let dgy = -win; dgy <= win; dgy++) {
        for (let dgx = -win; dgx <= win; dgx++) {
          const ngx = gx + dgx, ngy = gy + dgy;
          if (ngx < 0 || ngx >= w.gw || ngy < 0 || ngy >= w.gh) continue;
          const list = w.grid[ngy * w.gw + ngx]!;
          for (const idx of list) {
            const o = w.cells[idx]!;
            if (!o.alive || o.team === m.team) continue;
            const dx = m.x - o.x, dy = m.y - o.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < pR2 && d2 > 36) {
              const d = Math.sqrt(d2);
              o.vx += (dx / d) * 0.07;
              o.vy += (dy / d) * 0.07;
            }
          }
        }
      }
    }
  }
}
