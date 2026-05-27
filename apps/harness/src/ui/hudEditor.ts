// HUD editor: toggles for counters/leaderboard/intro/winner + a text input for the intro title.
// Edits apply LIVE via the player's setHudConfig (no re-instantiation). Binds to whichever player
// the PlayerPanel currently owns.

import type { HudConfig } from "@cellstorm/render";
import type { PlayerPanel } from "./playerPanel";

export class HudEditor {
  readonly el: HTMLElement;
  private readonly panel: PlayerPanel;

  constructor(panel: PlayerPanel) {
    this.panel = panel;
    this.el = document.createElement("div");
    this.el.className = "hud-editor";
    this.render();
  }

  /** Re-read the live HUD config (call when a new player loads). */
  refresh(): void {
    this.render();
  }

  private render(): void {
    this.el.innerHTML = "";
    const header = document.createElement("div");
    header.className = "panel-header";
    header.textContent = "HUD";
    this.el.appendChild(header);

    const player = this.panel.getPlayer();
    const hud = player ? player.hudConfig() : this.panel.getHud();

    const apply = (patch: Partial<HudConfig>) => {
      this.panel.getPlayer()?.setHudConfig(patch);
    };

    this.el.appendChild(this.toggle("Counters", hud.showCounters, (v) => apply({ showCounters: v })));
    this.el.appendChild(
      this.toggle("Leaderboard", hud.showLeaderboard, (v) => apply({ showLeaderboard: v })),
    );
    this.el.appendChild(this.toggle("Intro", hud.showIntro, (v) => apply({ showIntro: v })));
    this.el.appendChild(this.toggle("Winner", hud.showWinner, (v) => apply({ showWinner: v })));

    const titleField = document.createElement("div");
    titleField.className = "field";
    const label = document.createElement("label");
    label.className = "field-label";
    label.textContent = "Intro title";
    const input = document.createElement("input");
    input.type = "text";
    input.value = hud.introTitle;
    input.placeholder = "(auto from powers)";
    input.oninput = () => apply({ introTitle: input.value });
    titleField.append(label, input);
    this.el.appendChild(titleField);
  }

  private toggle(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
    const row = document.createElement("label");
    row.className = "toggle";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = value;
    cb.onchange = () => onChange(cb.checked);
    const span = document.createElement("span");
    span.textContent = label;
    row.append(cb, span);
    return row;
  }
}
