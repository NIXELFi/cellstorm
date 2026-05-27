// HUD compositor: orchestrates the broadcast-overlay elements (counters, leaderboard, intro,
// winner) over the scene as a single Pixi Container so it composites identically at any
// resolution. Config-driven: each element is toggled via HudConfig; the intro title is
// editable live. The same Hud instance is used by the harness preview and the 4K renderer.

import { Application, Container } from "pixi.js";
import type { ArenaParams } from "@cellstorm/sim";
import { THEME, type Theme } from "../theme";
import { type HudConfig, DEFAULT_HUD } from "./types";
import { defaultIntroTitle } from "./logic";
import { Counters } from "./counters";
import { Leaderboard } from "./leaderboard";
import { Intro } from "./intro";
import { Winner } from "./winner";

export interface HudOptions {
  arena: ArenaParams;
  scale: number;
  theme?: Theme;
}

export class Hud {
  readonly root = new Container();
  private config: HudConfig;
  private readonly counters: Counters;
  private readonly leaderboard: Leaderboard;
  private readonly intro: Intro;
  private readonly winner: Winner;

  constructor(app: Application, config: HudConfig, teamPowers: string[], opts: HudOptions) {
    this.config = { ...DEFAULT_HUD, ...config };
    const { arena, scale } = opts;
    const theme = opts.theme ?? THEME;

    this.counters = new Counters(teamPowers, scale, theme);
    this.leaderboard = new Leaderboard(teamPowers, scale, theme);
    this.leaderboard.view.position.set(6 * scale, arena.height * scale - teamPowers.length * 16 * scale - 8 * scale);
    const title = this.config.introTitle || defaultIntroTitle(teamPowers);
    this.intro = new Intro(arena.width, scale, title, this.config.introSeconds);
    this.winner = new Winner(arena.width, arena.height, scale, theme);

    this.root.addChild(this.counters.view, this.leaderboard.view, this.intro.view, this.winner.view);
    app.stage.addChild(this.root);
    this.applyVisibility();
  }

  /** Update all elements for this frame. `winner`: -2 unresolved, -1 tie, >=0 team. */
  update(counts: number[], tick: number, winner: number): void {
    if (this.config.showCounters) this.counters.update(counts);
    if (this.config.showLeaderboard) this.leaderboard.update(counts);
    if (this.config.showIntro) this.intro.update(tick);
    if (this.config.showWinner) this.winner.update(winner, tick);
  }

  setConfig(config: Partial<HudConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.introTitle !== undefined) this.intro.setTitle(config.introTitle);
    if (config.introSeconds !== undefined) this.intro.setIntroSeconds(config.introSeconds);
    this.applyVisibility();
  }

  getConfig(): HudConfig {
    return { ...this.config };
  }

  /** Reset transient state (winner reveal) when the player seeks/restarts. */
  reset(): void {
    this.winner.reset();
  }

  private applyVisibility(): void {
    this.counters.view.visible = this.config.showCounters;
    this.leaderboard.view.visible = this.config.showLeaderboard;
    this.intro.view.visible = this.config.showIntro;
    this.winner.view.visible = this.config.showWinner;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
