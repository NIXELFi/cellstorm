// Per-power visual identity. Team color stays the primary read; the SHAPE conveys archetype
// (every cell on a team shares the team's one power, so a whole team reads as e.g. "sharp
// diamonds" = burst, "blocky squares" = tanky). Plus per-power FX flags (halo, frenzy glow,
// death-burst style). Pure data + a Pixi path helper — no gameplay coupling, cosmetic only.

import type { Graphics } from "pixi.js";

export type CellShape = "circle" | "square" | "diamond" | "triangle" | "hexagon";

export interface PowerStyle {
  shape: CellShape;
  halo?: "heal" | "shield"; // soft secondary aura
  frenzy?: boolean; // glow intensifies as hp drops
  death?: "shatter" | "shockwave"; // special death burst
}

// Archetype mapping: square=bulky/defensive, triangle=aggressive/fast, diamond=burst/ranged,
// hexagon=control, circle=sustain/support.
const STYLES: Record<string, PowerStyle> = {
  Tank: { shape: "square" },
  Goliath: { shape: "square" },
  Brute: { shape: "square" },
  Shielder: { shape: "square", halo: "shield" },
  Reflector: { shape: "square", halo: "shield" },
  Berserker: { shape: "triangle" },
  Swift: { shape: "triangle" },
  Charger: { shape: "triangle" },
  Frenzy: { shape: "triangle", frenzy: true },
  Glasshammer: { shape: "diamond", death: "shatter" },
  Sniper: { shape: "diamond" },
  Bomb: { shape: "diamond", death: "shockwave" },
  Magnet: { shape: "hexagon" },
  Stunner: { shape: "hexagon" },
  Plague: { shape: "hexagon" },
  Vampire: { shape: "circle", halo: "heal" },
  Regen: { shape: "circle", halo: "heal" },
  Lifebloom: { shape: "circle", halo: "heal" },
  Necromancer: { shape: "circle", halo: "heal" },
  Splitter: { shape: "circle" },
};

export function powerStyle(name: string): PowerStyle {
  return STYLES[name] ?? { shape: "circle" };
}

/** Add a shape path centered at (x,y) sized by `r`. Caller fills/strokes. */
export function addShape(g: Graphics, shape: CellShape, x: number, y: number, r: number): void {
  switch (shape) {
    case "square": {
      const a = r * 0.92;
      g.roundRect(x - a, y - a, a * 2, a * 2, a * 0.35);
      break;
    }
    case "diamond":
      g.poly([x, y - r * 1.3, x + r * 1.1, y, x, y + r * 1.3, x - r * 1.1, y]);
      break;
    case "triangle":
      g.poly([x, y - r * 1.35, x + r * 1.2, y + r, x - r * 1.2, y + r]);
      break;
    case "hexagon": {
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        pts.push(x + Math.cos(a) * r * 1.12, y + Math.sin(a) * r * 1.12);
      }
      g.poly(pts);
      break;
    }
    case "circle":
    default:
      g.circle(x, y, r);
      break;
  }
}
