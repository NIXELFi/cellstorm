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
  seg: HTMLElement; // proportional bar segment
  label: HTMLElement;
  countEl: HTMLElement;
  display: number; // eased counter value
}

export class CssHud {
  private readonly root: HTMLElement;
  private readonly theme: Theme;
  private readonly powers: string[];
  private config: HudConfig;

  private side!: HTMLElement;
  private scrim!: HTMLElement;
  private labelsEl!: HTMLElement;
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
      // Segment width = share of living cells (driven by the eased value per tick).
      row.seg.style.flexGrow = String(Math.max(0, row.display));
      row.seg.classList.toggle("dead", dead);
      row.label.classList.toggle("dead", dead);
      row.label.classList.toggle("lead", !dead && t === lead && winner < 0);
    }
    this.fitLabels();

    // Intro fade (tick-driven). The side scoreboard fades IN as the intro fades out, so the two
    // don't clash on screen at the start.
    const ia = this.config.showIntro ? introAlpha(tick, this.config.introSeconds) : 0;
    this.intro.style.opacity = String(ia);
    this.intro.style.display = ia <= 0.001 ? "none" : "flex";
    this.side.style.opacity = String(1 - ia);
    this.scrim.style.opacity = String(1 - ia);

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

  /** Scale the label row to fit the strip width so it stays on ONE centered line at any team
   *  count (2 -> 10+). Names/digit-widths vary, so we measure and scale rather than guess. */
  private fitLabels(): void {
    const labels = this.labelsEl;
    labels.style.transform = "none";
    const avail = this.side.clientWidth;
    const natural = labels.offsetWidth; // true content width (width: max-content)
    if (avail > 0 && natural > avail) {
      labels.style.transform = `scale(${(avail / natural).toFixed(4)})`;
    }
  }

  destroy(): void {
    this.root.innerHTML = "";
  }

  // -- build -----------------------------------------------------------------

  private build(): void {
    this.root.classList.add("cs-hud");
    this.root.innerHTML = "";

    // Darkening + blur scrim behind the top strip so the labels stay readable over the battle;
    // gradients/fades down into the action.
    this.scrim = el("div", "cs-topscrim");

    // Side display (top): a slim proportional strip — each team a segment sized by its share of
    // living cells (shrinks as it dies) — plus a tiny name+count label row. Minimal, out of the way.
    this.side = el("div", "cs-side");
    const pbar = el("div", "cs-pbar");
    const labels = el("div", "cs-labels");
    this.labelsEl = labels;
    this.powers.forEach((power, t) => {
      const color = this.teamColor(t);
      const seg = el("div", "cs-seg");
      seg.style.setProperty("--c", color);
      pbar.appendChild(seg);

      const label = el("div", "cs-lab");
      label.style.setProperty("--c", color);
      const dot = el("span", "cs-lab-dot");
      const name = el("span", "cs-lab-name");
      name.textContent = power;
      const count = el("span", "cs-lab-count");
      count.textContent = "0";
      label.append(dot, name, count);
      labels.appendChild(label);

      this.rows.push({ seg, label, countEl: count, display: 0 });
    });
    this.side.append(pbar, labels);

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

    // Scrim first so it sits behind the strip.
    this.root.append(this.scrim, this.side, this.intro, this.winnerEl);
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
.cs-topscrim {
  position: absolute; top: 0; left: 0; right: 0; height: 13cqh;
  background: linear-gradient(to bottom,
    rgba(5,3,10,0.82) 0%, rgba(5,3,10,0.6) 45%, rgba(5,3,10,0.25) 75%, transparent 100%);
  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
  /* fade the blur out at the bottom so there's no hard edge */
  -webkit-mask-image: linear-gradient(to bottom, #000 55%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 55%, transparent 100%);
}
.cs-side {
  position: absolute; top: 1.8cqh; left: 2cqh; right: 2cqh;
  display: flex; flex-direction: column; align-items: center; gap: 0.9cqh;
}
.cs-pbar {
  display: flex; gap: 0.45cqh; height: 1.25cqh; width: 100%;
}
.cs-seg {
  background: var(--c); border-radius: 1cqh; min-width: 0;
  box-shadow: 0 0 0.8cqh color-mix(in srgb, var(--c) 55%, transparent);
}
.cs-seg:not(.dead) { min-width: 1.2cqw; }
.cs-seg.dead { opacity: 0; }
/* labels: ONE line, sized to content (max-content), centered, then scaled to fit (see fitLabels). */
.cs-labels { display: flex; flex-wrap: nowrap; align-items: baseline;
  width: max-content; max-width: none;
  gap: 2.4cqw; white-space: nowrap; transform-origin: center top; will-change: transform; }
.cs-lab { display: flex; align-items: baseline; gap: 0.8cqw; }
.cs-lab-dot { width: 1.7cqw; height: 1.7cqw; border-radius: 50%;
  background: var(--c); align-self: center; box-shadow: 0 0 0.7cqh var(--c); }
.cs-lab-name { font-weight: 700; font-size: 2.4cqw; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--c); text-shadow: 0 0.15cqh 0.6cqh rgba(0,0,0,0.7); }
.cs-lab-count { font-family: var(--display); font-size: 3.3cqw; color: #fff;
  font-variant-numeric: tabular-nums; text-shadow: 0 0.15cqh 0.6cqh rgba(0,0,0,0.8); }
.cs-lab.dead { opacity: 0.32; }
.cs-lab.dead .cs-lab-name { text-decoration: line-through; }
.cs-lab.lead .cs-lab-dot { box-shadow: 0 0 1.6cqh var(--c); }

.cs-intro {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(110% 80% at 50% 46%, rgba(5,2,10,0.35) 0%, rgba(5,2,10,0.74) 72%);
  text-align: center; padding: 5cqh;
}
.cs-intro-inner { display: flex; flex-direction: column; align-items: center; gap: 1.8cqh; max-width: 88%; }
.cs-eyebrow { font-weight: 700; letter-spacing: 0.5em; font-size: 1.3cqh; color: rgba(255,255,255,0.5);
  text-indent: 0.5em; }
.cs-intro-title { font-family: var(--display); font-size: 4.6cqh; line-height: 1.0; letter-spacing: 0.01em;
  text-transform: uppercase; text-wrap: balance;
  background: linear-gradient(180deg, #fff, #c8c8d6); -webkit-background-clip: text; background-clip: text;
  color: transparent; text-shadow: 0 0.4cqh 2cqh rgba(0,0,0,0.55); }
.cs-rule { width: 9cqh; height: 0.25cqh; border-radius: 1cqh;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent); }
.cs-sub { font-size: 1.4cqh; font-weight: 600; letter-spacing: 0.04em; color: rgba(232,232,236,0.72);
  text-transform: uppercase; }
.cs-chips { display: flex; flex-direction: column; gap: 0.7cqh; margin-top: 0.4cqh; align-items: stretch; }
.cs-chip { display: flex; align-items: center; gap: 0.8cqh; padding: 0.6cqh 1.1cqh; border-radius: 1cqh;
  background: rgba(14,11,22,0.5); border: 0.12cqh solid color-mix(in srgb, var(--c) 40%, transparent); }
.cs-chip-dot { width: 1.1cqh; height: 1.1cqh; border-radius: 50%; background: var(--c); flex: none;
  box-shadow: 0 0 0.9cqh var(--c); }
.cs-chip-name { font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; font-size: 1.3cqh; color: var(--c); }
.cs-chip-desc { font-size: 1.15cqh; font-weight: 500; color: rgba(232,232,236,0.58); margin-left: auto; }

.cs-winner {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  /* same darkening + blur treatment as the top scrim, as a full-screen vignette */
  background: radial-gradient(125% 95% at 50% 50%,
    color-mix(in srgb, var(--c) 16%, rgba(5,2,10,0.7)) 0%, rgba(5,2,10,0.86) 55%, rgba(5,2,10,0.95) 100%);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
}
.cs-winner-card { display: flex; flex-direction: column; align-items: center; gap: 1cqh;
  transform-origin: center; will-change: transform, opacity; }
.cs-winner-kicker { font-weight: 700; letter-spacing: 0.45em; font-size: 1.5cqh; color: rgba(255,255,255,0.6);
  text-indent: 0.45em; }
.cs-winner-name { font-family: var(--display); font-size: 11cqh; line-height: 0.85; text-transform: uppercase;
  letter-spacing: 0.01em; text-shadow: 0 0 3.5cqh var(--c), 0 0.6cqh 2cqh rgba(0,0,0,0.6); }
.cs-winner-wins { font-family: var(--display); font-size: 6cqh; line-height: 0.85; color: #fff;
  letter-spacing: 0.14em; -webkit-text-stroke: 0.2cqh color-mix(in srgb, var(--c) 70%, transparent); }
.cs-winner-sub { font-size: 1.6cqh; font-weight: 600; letter-spacing: 0.07em; color: rgba(232,232,236,0.75);
  text-transform: uppercase; }
`;
