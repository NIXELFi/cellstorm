// Dynamic leaderboard: rows reorder live by team count (descending), each row showing the
// team color swatch, power name, and count. Ordering logic lives in ./logic.leaderboardOrder.

import { Container, Graphics, Text } from "pixi.js";
import { THEME, type Theme } from "../theme";
import { leaderboardOrder } from "./logic";

interface LeaderRow {
  team: number;
  view: Container;
  label: Text;
  count: Text;
}

export class Leaderboard {
  readonly view = new Container();
  private readonly rows: LeaderRow[] = [];
  private readonly rowH: number;
  private readonly scale: number;

  constructor(teamPowers: string[], scale: number, theme: Theme = THEME) {
    this.scale = scale;
    this.rowH = 16 * scale;
    for (let t = 0; t < teamPowers.length; t++) {
      const color = theme.teams[t % theme.teams.length]?.color ?? 0xffffff;
      const view = new Container();

      const swatch = new Graphics();
      swatch.rect(0, 0, 8 * scale, 8 * scale).fill({ color });

      const label = new Text({
        text: teamPowers[t]!.toLowerCase(),
        style: { fill: color, fontSize: 11 * scale },
      });
      label.position.set(12 * scale, -2 * scale);

      const count = new Text({
        text: "0",
        style: { fill: 0xffffff, fontSize: 11 * scale, fontWeight: "500" },
      });
      count.position.set(64 * scale, -2 * scale);

      view.addChild(swatch, label, count);
      this.view.addChild(view);
      this.rows.push({ team: t, view, label, count });
    }
  }

  update(counts: number[]): void {
    const order = leaderboardOrder(counts);
    for (let rank = 0; rank < order.length; rank++) {
      const entry = order[rank]!;
      const row = this.rows[entry.team]!;
      row.view.position.set(0, rank * this.rowH);
      row.count.text = String(entry.count);
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
