// Tuning panel: sliders for sim constants (totalCells, arena size, maxTicks) and a couple of theme
// values (background tint, team color hue is left to THEME for now). Changing a sim constant
// re-instantiates the player (the sim world must be rebuilt), since these live in the BattleConfig.
// NOTE: editing sim constants changes the battle — it's an experimentation tool, not a way to
// preview the exact ranked battle. The ranked battle uses the stored config's own constants.

import { THEME, type Theme } from "@cellstorm/render";
import type { BattleConfig } from "@cellstorm/sim";
import type { PlayerPanel } from "./playerPanel";

export class TuningPanel {
  readonly el: HTMLElement;
  private readonly panel: PlayerPanel;
  private overrides: Partial<Pick<BattleConfig, "totalCells" | "maxTicks">> = {};
  private arenaScale = 1;
  private bgTint = THEME.background;

  constructor(panel: PlayerPanel) {
    this.panel = panel;
    this.el = document.createElement("div");
    this.el.className = "tuning-panel";
    this.render();
  }

  /** Reset overrides to the loaded config's baseline (call on new candidate load). */
  reset(): void {
    this.overrides = {};
    this.arenaScale = 1;
    this.bgTint = THEME.background;
    this.render();
  }

  private render(): void {
    this.el.innerHTML = "";
    const header = document.createElement("div");
    header.className = "panel-header";
    header.textContent = "Tuning (sim + visuals)";
    this.el.appendChild(header);

    const base = this.panel.getConfig();
    const totalCells = this.overrides.totalCells ?? base?.totalCells ?? 900;
    const maxTicks = this.overrides.maxTicks ?? base?.maxTicks ?? 4500;

    this.el.appendChild(
      this.slider("Total cells", totalCells, 100, 2000, 50, (v) => {
        this.overrides.totalCells = v;
        void this.apply();
      }),
    );
    this.el.appendChild(
      this.slider("Arena scale", this.arenaScale, 0.5, 2, 0.05, (v) => {
        this.arenaScale = v;
        void this.apply();
      }),
    );
    this.el.appendChild(
      this.slider("Max ticks", maxTicks, 600, 9000, 300, (v) => {
        this.overrides.maxTicks = v;
        void this.apply();
      }),
    );
    this.el.appendChild(
      this.slider("Background tint", this.bgTint, 0, 0xffffff, 1, (v) => {
        this.bgTint = Math.round(v);
        void this.apply();
      }),
    );
  }

  private currentTheme(): Theme {
    return { ...THEME, background: this.bgTint };
  }

  private async apply(): Promise<void> {
    const base = this.panel.getConfig();
    if (!base) return;
    const cfg: BattleConfig = {
      ...base,
      totalCells: this.overrides.totalCells ?? base.totalCells,
      maxTicks: this.overrides.maxTicks ?? base.maxTicks,
      arena: {
        width: Math.round(base.arena.width * this.arenaScale),
        height: Math.round(base.arena.height * this.arenaScale),
      },
    };
    await this.panel.load(cfg, this.panel.getHud(), this.currentTheme());
  }

  private slider(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "field";
    const l = document.createElement("label");
    l.className = "field-label";
    const valSpan = document.createElement("span");
    valSpan.className = "muted";
    valSpan.textContent = String(value);
    l.textContent = label + " ";
    l.appendChild(valSpan);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.oninput = () => {
      valSpan.textContent = input.value;
    };
    input.onchange = () => onChange(Number(input.value));
    row.append(l, input);
    return row;
  }
}
