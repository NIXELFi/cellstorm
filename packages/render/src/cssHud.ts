// CSS broadcast HUD — a real DOM/CSS overlay on top of the Pixi canvas (not drawn in Pixi), so
// it can be styled and animated to a "beautifully edited Short" bar. The SAME class drives the
// harness preview and the headless renderer (WYSIWYG): the renderer screenshots the whole page,
// not just the canvas, so this overlay is baked into the MP4.
//
// DETERMINISM: the renderer is wall-clock-decoupled (steps + screenshots, no real time passes),
// so we CANNOT rely on CSS @keyframes/transitions for render-critical motion — those would freeze.
// Every animated value (counts, intro fade, winner pop) is computed from the deterministic TICK
// via ./hud/logic and applied as inline styles, so it animates identically live and in render.

import type { HudConfig } from "./hud/types";
import { DEFAULT_HUD } from "./hud/types";
import { THEME, type Theme } from "./theme";
import { powerDesc } from "./descs";
import { easeCounter, introAlpha, winnerAlpha, leaderTeam } from "./hud/logic";

const FONT_LINK_ID = "cs-hud-fonts";
const STYLE_ID = "cs-hud-style";

function hex(n: number): string {
  return "#" + (n & 0xffffff).toString(16).padStart(6, "0");
}

interface TeamRow {
  card: HTMLElement;
  countEl: HTMLElement;
  display: number; // eased counter value
}

export class CssHud {
  private readonly root: HTMLElement;
  private readonly theme: Theme;
  private readonly powers: string[];
  private config: HudConfig;

  private side!: HTMLElement;
  private rows: TeamRow[] = [];
  private intro!: HTMLElement;
  private winnerEl!: HTMLElement;
  private winnerName!: HTMLElement;
  private winnerSub!: HTMLElement;
  private resolvedTick = -1;
  private shownWinner = -2;

  constructor(root: HTMLElement, config: HudConfig, powers: string[], theme: Theme = THEME) {
    this.root = root;
    this.config = { ...DEFAULT_HUD, ...config };
    this.powers = powers;
    this.theme = theme;
    ensureFonts();
    ensureStyle();
    this.build();
    this.applyVisibility();
  }

  setConfig(partial: Partial<HudConfig>): void {
    this.config = { ...this.config, ...partial };
    // Rebuild intro text if the title changed.
    this.intro.querySelector(".cs-intro-title")!.textContent = this.introTitle();
    this.applyVisibility();
  }

  getConfig(): HudConfig {
    return { ...this.config };
  }

  /** Tick-driven update. counts: live per-team alive counts. winner: -2/-1/team. */
  update(counts: number[], tick: number, winner: number): void {
    const lead = leaderTeam(counts);
    for (let t = 0; t < this.rows.length; t++) {
      const row = this.rows[t]!;
      const target = counts[t] ?? 0;
      row.display = easeCounter(row.display, target);
      row.countEl.textContent = String(Math.round(row.display));
      const dead = target <= 0;
      row.card.classList.toggle("cs-dead", dead);
      row.card.classList.toggle("cs-lead", !dead && t === lead && winner < 0);
    }

    // Intro fade (tick-driven). The side scoreboard fades IN as the intro fades out, so the two
    // don't clash on screen at the start.
    const ia = this.config.showIntro ? introAlpha(tick, this.config.introSeconds) : 0;
    this.intro.style.opacity = String(ia);
    this.intro.style.display = ia <= 0.001 ? "none" : "flex";
    this.side.style.opacity = String(1 - ia);

    // Winner reveal (tick-driven pop-in). Reset if we scrub back before resolution.
    if (winner < 0) {
      this.resolvedTick = -1;
      this.winnerEl.style.display = "none";
    } else {
      if (this.resolvedTick < 0 || winner !== this.shownWinner) {
        this.resolvedTick = tick;
        this.shownWinner = winner;
        this.fillWinner(winner, counts[winner] ?? 0);
      }
      const since = Math.max(0, tick - this.resolvedTick);
      const a = this.config.showWinner ? winnerAlpha(winner, since, 0.5) : 0;
      const pop = 0.82 + 0.18 * a; // subtle scale-up as it fades in
      this.winnerEl.style.display = a <= 0.001 ? "none" : "flex";
      this.winnerEl.style.opacity = String(a);
      const card = this.winnerEl.firstElementChild as HTMLElement;
      card.style.transform = `scale(${pop.toFixed(3)})`;
    }
  }

  destroy(): void {
    this.root.innerHTML = "";
  }

  // -- build -----------------------------------------------------------------

  private build(): void {
    this.root.classList.add("cs-hud");
    this.root.innerHTML = "";

    // Side scoreboard (top): one card per team.
    this.side = el("div", "cs-side");
    this.powers.forEach((power, t) => {
      const color = this.teamColor(t);
      const card = el("div", "cs-card");
      card.style.setProperty("--c", color);
      const bar = el("div", "cs-bar");
      const mid = el("div", "cs-mid");
      const name = el("div", "cs-name");
      name.textContent = power;
      const desc = el("div", "cs-desc");
      desc.textContent = powerDesc(power);
      mid.append(name, desc);
      const count = el("div", "cs-count");
      count.textContent = "0";
      card.append(bar, mid, count);
      this.side.appendChild(card);
      this.rows.push({ card, countEl: count, display: 0 });
    });

    // Intro overlay (centered explainer).
    this.intro = el("div", "cs-intro");
    const introInner = el("div", "cs-intro-inner");
    const eyebrow = el("div", "cs-eyebrow");
    eyebrow.textContent = "CELLSTORM";
    const title = el("div", "cs-intro-title");
    title.textContent = this.introTitle();
    const rule = el("div", "cs-rule");
    const sub = el("div", "cs-sub");
    sub.textContent = `${this.powers.length} teams · one power each · last cell standing wins`;
    const chips = el("div", "cs-chips");
    this.powers.forEach((power, t) => {
      const chip = el("div", "cs-chip");
      chip.style.setProperty("--c", this.teamColor(t));
      const dot = el("span", "cs-chip-dot");
      const cn = el("span", "cs-chip-name");
      cn.textContent = power;
      const cd = el("span", "cs-chip-desc");
      cd.textContent = powerDesc(power);
      chip.append(dot, cn, cd);
      chips.appendChild(chip);
    });
    introInner.append(eyebrow, title, rule, sub, chips);
    this.intro.appendChild(introInner);

    // Winner overlay.
    this.winnerEl = el("div", "cs-winner");
    const wcard = el("div", "cs-winner-card");
    const wkicker = el("div", "cs-winner-kicker");
    wkicker.textContent = "LAST TEAM STANDING";
    this.winnerName = el("div", "cs-winner-name");
    const wwins = el("div", "cs-winner-wins");
    wwins.textContent = "WINS";
    this.winnerSub = el("div", "cs-winner-sub");
    wcard.append(wkicker, this.winnerName, wwins, this.winnerSub);
    this.winnerEl.appendChild(wcard);
    this.winnerEl.style.display = "none";

    this.root.append(this.side, this.intro, this.winnerEl);
  }

  private fillWinner(winner: number, survivors: number): void {
    const color = this.teamColor(winner);
    const power = this.powers[winner] ?? "—";
    this.winnerName.textContent = power;
    this.winnerName.style.color = color;
    this.winnerName.style.setProperty("--c", color);
    this.winnerSub.textContent = survivors > 0 ? `${survivors} cells survived` : "";
    (this.winnerEl.firstElementChild as HTMLElement).style.setProperty("--c", color);
  }

  private applyVisibility(): void {
    this.side.style.display = this.config.showCounters || this.config.showLeaderboard ? "flex" : "none";
  }

  private introTitle(): string {
    const custom = this.config.introTitle.trim();
    if (custom) return custom;
    // Powers are already listed in the chips below, so keep the headline a punchy hook.
    if (this.powers.length === 2) return `${this.powers[0]} vs ${this.powers[1]}`;
    return "Who survives?";
  }

  private teamColor(team: number): string {
    const t = this.theme.teams[team % this.theme.teams.length];
    return hex(t ? t.color : 0xffffff);
  }
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function ensureFonts(): void {
  if (document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@500;600;700&display=swap";
  document.head.appendChild(link);
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

const CSS = `
.cs-hud {
  position: absolute; inset: 0; pointer-events: none; overflow: hidden;
  font-family: "Archivo", system-ui, sans-serif; color: #fff; line-height: 1.2;
  --display: "Anton", "Archivo", sans-serif;
  container-type: size;
}
/* sizes scale with the canvas via cqh (container query height) so it works at preview AND 4K */
.cs-side {
  position: absolute; top: 2.2cqh; left: 2.4cqh; right: 2.4cqh;
  display: flex; flex-direction: column; gap: 1.1cqh;
}
.cs-card {
  display: flex; align-items: center; gap: 1.4cqh;
  padding: 1.1cqh 1.4cqh; border-radius: 1.4cqh;
  background: linear-gradient(135deg, rgba(14,11,22,0.72), rgba(14,11,22,0.42));
  border: 0.18cqh solid color-mix(in srgb, var(--c) 35%, transparent);
  box-shadow: 0 0.5cqh 2cqh rgba(0,0,0,0.45), inset 0 0 1.4cqh color-mix(in srgb, var(--c) 9%, transparent);
  backdrop-filter: blur(6px);
  transition: opacity .25s ease, filter .25s ease;
}
.cs-card.cs-lead { border-color: color-mix(in srgb, var(--c) 80%, transparent);
  box-shadow: 0 0.5cqh 2.4cqh rgba(0,0,0,0.5), 0 0 2.4cqh color-mix(in srgb, var(--c) 45%, transparent); }
.cs-card.cs-dead { opacity: .28; filter: grayscale(0.7); }
.cs-bar { width: 0.7cqh; align-self: stretch; border-radius: 1cqh; background: var(--c);
  box-shadow: 0 0 1.2cqh var(--c); }
.cs-mid { flex: 1; min-width: 0; }
.cs-name { font-weight: 700; font-size: 2.5cqh; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--c); line-height: 1; text-shadow: 0 0 1.2cqh color-mix(in srgb, var(--c) 50%, transparent); }
.cs-dead .cs-name { text-decoration: line-through; }
.cs-desc { font-size: 1.75cqh; font-weight: 500; color: rgba(232,232,236,0.74); margin-top: 0.6cqh;
  letter-spacing: 0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cs-count { font-family: var(--display); font-size: 5cqh; line-height: 0.9; color: #fff;
  font-variant-numeric: tabular-nums; text-shadow: 0 0 2cqh color-mix(in srgb, var(--c) 60%, transparent);
  min-width: 3ch; text-align: right; }

.cs-intro {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(120% 90% at 50% 42%, rgba(5,2,10,0.55) 0%, rgba(5,2,10,0.9) 70%);
  text-align: center; padding: 6cqh;
}
.cs-intro-inner { display: flex; flex-direction: column; align-items: center; gap: 2.8cqh; max-width: 92%; }
.cs-eyebrow { font-weight: 700; letter-spacing: 0.55em; font-size: 2cqh; color: rgba(255,255,255,0.55);
  text-indent: 0.55em; }
.cs-intro-title { font-family: var(--display); font-size: 6.8cqh; line-height: 1.0; letter-spacing: 0.01em;
  text-transform: uppercase; text-wrap: balance;
  background: linear-gradient(180deg, #fff, #c8c8d6); -webkit-background-clip: text; background-clip: text;
  color: transparent; text-shadow: 0 0.6cqh 3cqh rgba(0,0,0,0.6); }
.cs-rule { width: 14cqh; height: 0.4cqh; border-radius: 1cqh;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent); }
.cs-sub { font-size: 2.1cqh; font-weight: 600; letter-spacing: 0.05em; color: rgba(232,232,236,0.78);
  text-transform: uppercase; }
.cs-chips { display: flex; flex-wrap: wrap; gap: 1.4cqh; justify-content: center; margin-top: 1cqh; }
.cs-chip { display: flex; align-items: center; gap: 1cqh; padding: 1cqh 1.6cqh; border-radius: 5cqh;
  background: rgba(14,11,22,0.6); border: 0.18cqh solid color-mix(in srgb, var(--c) 45%, transparent);
  box-shadow: inset 0 0 1.6cqh color-mix(in srgb, var(--c) 14%, transparent); }
.cs-chip-dot { width: 1.6cqh; height: 1.6cqh; border-radius: 50%; background: var(--c);
  box-shadow: 0 0 1.4cqh var(--c); }
.cs-chip-name { font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: 1.9cqh; color: var(--c); }
.cs-chip-desc { font-size: 1.6cqh; font-weight: 500; color: rgba(232,232,236,0.62); }

.cs-winner {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(120% 90% at 50% 50%, color-mix(in srgb, var(--c) 14%, rgba(5,2,10,0.55)) 0%, rgba(5,2,10,0.92) 72%);
}
.cs-winner-card { display: flex; flex-direction: column; align-items: center; gap: 1.4cqh;
  transform-origin: center; will-change: transform, opacity; }
.cs-winner-kicker { font-weight: 700; letter-spacing: 0.5em; font-size: 2.2cqh; color: rgba(255,255,255,0.6);
  text-indent: 0.5em; }
.cs-winner-name { font-family: var(--display); font-size: 16cqh; line-height: 0.85; text-transform: uppercase;
  letter-spacing: 0.01em; text-shadow: 0 0 5cqh var(--c), 0 0.8cqh 3cqh rgba(0,0,0,0.6); }
.cs-winner-wins { font-family: var(--display); font-size: 9cqh; line-height: 0.85; color: #fff;
  letter-spacing: 0.14em; -webkit-text-stroke: 0.25cqh color-mix(in srgb, var(--c) 70%, transparent); }
.cs-winner-sub { font-size: 2.4cqh; font-weight: 600; letter-spacing: 0.08em; color: rgba(232,232,236,0.75);
  text-transform: uppercase; }
`;
