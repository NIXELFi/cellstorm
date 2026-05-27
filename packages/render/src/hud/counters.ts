// Live animated team counters (top overlay) — port of the prototype `#stats` grid.
// Each team shows an animated count + lowercased power name, tinted by team color.
// Pure animation math lives in ./logic (easeCounter); this is the Pixi shell.

import { Container, Text } from "pixi.js";
import { THEME, type Theme } from "../theme";
import { easeCounter } from "./logic";

interface CounterRow {
  count: Text;
  power: Text;
  display: number;
}

export class Counters {
  readonly view = new Container();
  private readonly rows: CounterRow[] = [];

  constructor(teamPowers: string[], scale: number, theme: Theme = THEME) {
    const cols = teamPowers.length <= 3 ? teamPowers.length : 3;
    const colW = (90 * scale) / cols;
    for (let t = 0; t < teamPowers.length; t++) {
      const color = theme.teams[t % theme.teams.length]?.color ?? 0xffffff;
      const col = t % cols;
      const rowIdx = Math.floor(t / cols);
      const x = 6 * scale + col * colW;
      const y = 8 * scale + rowIdx * 20 * scale;

      const count = new Text({
        text: "0",
        style: { fill: color, fontSize: 17 * scale, fontWeight: "500" },
      });
      count.position.set(x, y);

      const power = new Text({
        text: teamPowers[t]!.toLowerCase(),
        style: { fill: color, fontSize: 11 * scale },
      });
      power.alpha = 0.8;
      power.position.set(x, y + 17 * scale);

      this.view.addChild(count, power);
      this.rows.push({ count, power, display: 0 });
    }
  }

  update(counts: number[]): void {
    for (let t = 0; t < this.rows.length; t++) {
      const row = this.rows[t]!;
      row.display = easeCounter(row.display, counts[t] ?? 0);
      row.count.text = String(Math.round(row.display));
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
