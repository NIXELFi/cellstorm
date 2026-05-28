// Browser-side entry. esbuild bundles this (plus @cellstorm/render + pixi.js) into a single IIFE
// that Playwright injects via page.addScriptTag. It constructs a Pixi Application + BattlePlayer and
// exposes a tiny imperative API on window that the Node side drives one tick at a time.
//
// Wall-clock-decoupled: nothing here uses rAF or timers for gameplay. The Node loop calls
// stepFrame() once per output frame and captures the canvas in between, so render speed is fully
// decoupled from real time.

import { Application } from "pixi.js";
import { BattlePlayer } from "@cellstorm/render";
import type { BattleConfig } from "@cellstorm/sim";
import type { HudConfig } from "@cellstorm/render";

// 9:16 master resolution. The base sim arena is 280x498 (~9:16); resolutionScale maps it onto the
// requested pixel canvas. width/height come from the Node side so we can render at low res for fast
// smoke tests and full 2160x3840 for production.
interface InitArgs {
  config: BattleConfig;
  hud: HudConfig;
  width: number;
  height: number;
}

declare global {
  interface Window {
    __cellstorm: {
      init(args: InitArgs): Promise<void>;
      stepFrame(): boolean;
      frame(): number;
      ended(): boolean;
      ready(): boolean;
    };
  }
}

let app: Application | null = null;
let player: BattlePlayer | null = null;

window.__cellstorm = {
  async init(args: InitArgs): Promise<void> {
    const canvas = document.getElementById("stage") as HTMLCanvasElement;
    app = new Application();
    await app.init({
      canvas,
      width: args.width,
      height: args.height,
      antialias: true,
      backgroundAlpha: 1,
      // Headless Chromium has no HiDPI; keep 1:1 so the captured PNG matches width/height exactly.
      resolution: 1,
      autoStart: false,
      // No animation ticker — we step manually so capture is wall-clock-decoupled.
      autoDensity: false,
    });

    // The sim arena is 280 wide. resolutionScale maps arena units -> canvas pixels.
    const resolutionScale = args.width / args.config.arena.width;
    const hudRoot = document.getElementById("hud") as HTMLElement;
    player = new BattlePlayer(app, {
      config: args.config,
      hud: args.hud,
      resolutionScale,
      hudRoot,
    });
    // Wait for the HUD display fonts so the very first captured frame isn't unstyled.
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    // Render the first (tick 0) frame so the very first capture is the initial state.
    app.render();
  },

  stepFrame(): boolean {
    if (!player || !app) throw new Error("not initialized");
    const ended = player.stepFrame();
    app.render();
    return ended;
  },

  frame(): number {
    return player ? player.frame : 0;
  },

  ended(): boolean {
    return player ? player.ended : true;
  },

  ready(): boolean {
    return player !== null && app !== null;
  },
};
