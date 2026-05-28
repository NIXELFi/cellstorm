// Browser-side entry. esbuild bundles this (plus @cellstorm/render + pixi.js) into a single IIFE
// that Playwright injects via page.addScriptTag. It constructs a Pixi Application + BattlePlayer and
// DRAWS Node-computed frames (single source of truth) — it does NOT simulate. The sim is not
// bit-identical across V8 builds (FMA contraction), so the battle is computed once in Node and the
// drawable per-tick frames are shipped here; the browser only renders + screenshots them. This makes
// the headless render identical to the harness preview (which replays the same Node frames).

import { Application } from "pixi.js";
import { BattlePlayer } from "@cellstorm/render";
import { unpackFrames, type BattleConfig, type DrawFrame, type SimEvent } from "@cellstorm/sim";
import type { HudConfig } from "@cellstorm/render";

interface InitArgs {
  config: BattleConfig;
  hud: HudConfig;
  width: number;
  height: number;
  /** Packed DrawFrame stream (from @cellstorm/sim packFrames), base64-encoded, computed in Node. */
  framesB64: string;
  /** All sim events, for cosmetic FX + impact, keyed by tick. */
  events: SimEvent[];
}

function decodeB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

declare global {
  interface Window {
    __cellstorm: {
      init(args: InitArgs): Promise<void>;
      drawFrame(index: number, hudHidden?: boolean, resetCosmetic?: boolean): void;
      frameCount(): number;
      ready(): boolean;
    };
  }
}

let app: Application | null = null;
let player: BattlePlayer | null = null;
let frames: DrawFrame[] = [];
let eventsByFrame: SimEvent[][] = [];

window.__cellstorm = {
  async init(args: InitArgs): Promise<void> {
    const canvas = document.getElementById("stage") as HTMLCanvasElement;
    app = new Application();
    await app.init({
      canvas, width: args.width, height: args.height, antialias: true,
      backgroundAlpha: 1, resolution: 1, autoStart: false, autoDensity: false,
    });

    const resolutionScale = args.width / args.config.arena.width;
    const hudRoot = document.getElementById("hud") as HTMLElement;
    player = new BattlePlayer(app, { config: args.config, hud: args.hud, resolutionScale, hudRoot });

    frames = unpackFrames(decodeB64(args.framesB64));
    // Bucket events by the tick they happen on, so each drawn frame gets exactly its new events.
    eventsByFrame = frames.map(() => []);
    for (const e of args.events) {
      if (e.tick >= 0 && e.tick < eventsByFrame.length) eventsByFrame[e.tick]!.push(e);
    }

    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    this.drawFrame(0);
    app.render();
  },

  drawFrame(index: number, hudHidden = false, resetCosmetic = false): void {
    if (!player || !app) throw new Error("not initialized");
    const f = frames[index];
    if (!f) return;
    player.renderSnapshot(f, eventsByFrame[index] ?? [], { hudHidden, resetCosmetic });
    app.render();
  },

  frameCount(): number {
    return frames.length;
  },

  ready(): boolean {
    return player !== null && app !== null;
  },
};
