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

/** Add a shape path centered at (x,y) sized by `r`. Moderate silhouettes — distinct enough to
 *  read the archetype, but not exaggerated. Caller fills/strokes. */
export function addShape(g: Graphics, shape: CellShape, x: number, y: number, r: number): void {
  switch (shape) {
    case "square": {
      // Lightly rounded block.
      const a = r * 0.96;
      g.roundRect(x - a, y - a, a * 2, a * 2, a * 0.28);
      break;
    }
    case "diamond":
      g.poly([x, y - r * 1.32, x + r * 1.08, y, x, y + r * 1.32, x - r * 1.08, y]);
      break;
    case "triangle":
      g.poly([x, y - r * 1.4, x + r * 1.25, y + r * 1.0, x - r * 1.25, y + r * 1.0]);
      break;
    case "hexagon": {
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        pts.push(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15);
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
