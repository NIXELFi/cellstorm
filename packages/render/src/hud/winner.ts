// Winner reveal: fades in centered text ("<Team> wins" / "tie") once the battle resolves.
// Fade opacity comes from ./logic.winnerAlpha, tracked from the tick the winner first appeared.

import { Container, Text } from "pixi.js";
import { THEME, type Theme } from "../theme";
import { winnerAlpha } from "./logic";

export class Winner {
  readonly view = new Container();
  private readonly label: Text;
  private readonly theme: Theme;
  private revealTick = -1;

  constructor(arenaW: number, arenaH: number, scale: number, theme: Theme = THEME) {
    this.theme = theme;
    this.label = new Text({
      text: "",
      style: { fill: 0xffffff, fontSize: 26 * scale, fontWeight: "500", align: "center" },
    });
    this.label.anchor.set(0.5, 0.5);
    this.label.position.set((arenaW * scale) / 2, arenaH * scale * 0.46);
    this.view.addChild(this.label);
    this.view.alpha = 0;
  }

  /** `winner`: -1 tie/extinct, >=0 team id. `tick` is the current sim tick. */
  update(winner: number, tick: number): void {
    if (winner === -2) {
      // Unresolved sentinel used by the sim; treat as not-yet-revealed.
      this.view.alpha = 0;
      return;
    }
    if (this.revealTick < 0 && winner >= -1) {
      this.revealTick = tick;
      if (winner >= 0) {
        const team = this.theme.teams[winner % this.theme.teams.length];
        this.label.text = `${team?.name ?? `Team ${winner}`} wins`;
        this.label.style.fill = team?.color ?? 0xffffff;
      } else {
        this.label.text = "tie";
        this.label.style.fill = 0xffffff;
      }
    }
    if (this.revealTick >= 0) {
      this.view.alpha = winnerAlpha(winner < 0 ? 0 : winner, tick - this.revealTick);
    }
  }

  reset(): void {
    this.revealTick = -1;
    this.view.alpha = 0;
    this.label.text = "";
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
