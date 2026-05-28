// Single-source-of-truth rendering support. The sim's floating-point results are NOT bit-identical
// across different V8 builds (Node vs headless Chromium vs a user's browser) — FMA contraction in the
// force math rounds 1 ULP differently, and a chaotic battle amplifies that into a different outcome.
// So we must simulate the battle ONCE (here, in Node) and ship the per-tick DRAWABLE state to every
// renderer (the headless 4K renderer AND the harness preview), which then only DRAWS — never re-sims.
// This guarantees preview == render == audio on any engine.
//
// A DrawFrame is the minimal state the scene needs to draw one tick (see render/scene.ts). Heavy
// gameplay fields are dropped; positions are kept as float (packed to compact binary for transport).

import type { BattleConfig } from "./types";
import { createWorld, teamCounts, type World } from "./world";
import { step } from "./step";
import { EventSink } from "./events";
import type { BattleLog, BattleSummary } from "./battle";
import type { TeamCountSnapshot } from "./types";

export interface DrawCell {
  team: number;
  x: number; y: number;
  radius: number;
  hpFrac: number; // hp / maxHp (all the scene needs for size + FX)
  vx: number; vy: number; // for the charger dash trail
  dash: number; stunT: number; plagueT: number; // state FX flags
}
export interface DrawProj { team: number; x: number; y: number; }
export interface DrawFrame {
  frame: number;
  winner: number;
  resolvedFrame: number;
  cells: DrawCell[];
  projectiles: DrawProj[];
}

/** Extract the drawable snapshot of the world at its current tick. */
export function toDrawFrame(w: World): DrawFrame {
  const cells: DrawCell[] = [];
  for (const c of w.cells) {
    if (!c.alive) continue;
    cells.push({
      team: c.team, x: c.x, y: c.y, radius: c.radius,
      hpFrac: c.maxHp > 0 ? c.hp / c.maxHp : 0,
      vx: c.vx, vy: c.vy, dash: c.dash, stunT: c.stunT, plagueT: c.plagueT,
    });
  }
  const projectiles = w.projectiles.map((p) => ({ team: p.team, x: p.x, y: p.y }));
  return { frame: w.frame, winner: w.winner, resolvedFrame: w.resolvedFrame, cells, projectiles };
}

const SAMPLE_EVERY = 6;

/**
 * Run the battle once and capture a DrawFrame per drawn tick (tick 0 first, then one after each
 * step, through the victory-beat outro). Also returns the same log/summary `runBattle` would, so a
 * single Node pass feeds the renderer (frames), the scorer (log) and the audio (log).
 */
export function captureFrames(cfg: BattleConfig): { log: BattleLog; summary: BattleSummary; frames: DrawFrame[] } {
  const w = createWorld(cfg);
  const sink = new EventSink();
  const frames: DrawFrame[] = [toDrawFrame(w)];
  const timeline: TeamCountSnapshot[] = [];
  let ended = false;
  while (!ended) {
    ended = step(w, sink);
    if (w.frame % SAMPLE_EVERY === 0 || ended) timeline.push({ tick: w.frame, counts: teamCounts(w) });
    frames.push(toDrawFrame(w));
  }
  const counts = teamCounts(w);
  const survivors = w.winner >= 0 ? counts[w.winner]! : 0;
  const durationTicks = w.resolvedFrame >= 0 ? w.resolvedFrame : w.frame;
  const log: BattleLog = { config: cfg, events: sink.events, timeline, durationTicks, totalTicks: w.frame, winner: w.winner };
  const summary: BattleSummary = { winner: w.winner, durationTicks, totalTicks: w.frame, survivors, resolved: w.winner >= 0 };
  return { log, summary, frames };
}

// --- compact binary transport (so the harness/renderer load ~MBs, not ~100MB of JSON) ------------
// Layout (little-endian): [u32 frameCount] then per frame:
//   [i32 frame][i16 winner][i32 resolvedFrame][u16 cellCount][u16 projCount]
//   cells: [u8 team][u8 hpFrac*255][u8 dash][u8 stunT][u8 plagueT][f32 x][f32 y][f32 vx][f32 vy]
//   projs: [u8 team][f32 x][f32 y]
const CELL_BYTES = 5 + 16;
const PROJ_BYTES = 1 + 8;
const u8c = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : Math.round(n));

export function packFrames(frames: DrawFrame[]): Uint8Array {
  let bytes = 4;
  for (const f of frames) bytes += 4 + 2 + 4 + 2 + 2 + f.cells.length * CELL_BYTES + f.projectiles.length * PROJ_BYTES;
  const buf = new ArrayBuffer(bytes);
  const dv = new DataView(buf);
  let o = 0;
  dv.setUint32(o, frames.length, true); o += 4;
  for (const f of frames) {
    dv.setInt32(o, f.frame, true); o += 4;
    dv.setInt16(o, f.winner, true); o += 2;
    dv.setInt32(o, f.resolvedFrame, true); o += 4;
    dv.setUint16(o, f.cells.length, true); o += 2;
    dv.setUint16(o, f.projectiles.length, true); o += 2;
    for (const c of f.cells) {
      dv.setUint8(o, c.team); dv.setUint8(o + 1, u8c(c.hpFrac * 255)); dv.setUint8(o + 2, u8c(c.dash));
      dv.setUint8(o + 3, u8c(c.stunT)); dv.setUint8(o + 4, u8c(c.plagueT)); o += 5;
      dv.setFloat32(o, c.x, true); dv.setFloat32(o + 4, c.y, true);
      dv.setFloat32(o + 8, c.vx, true); dv.setFloat32(o + 12, c.vy, true); o += 16;
    }
    for (const p of f.projectiles) {
      dv.setUint8(o, p.team); o += 1;
      dv.setFloat32(o, p.x, true); dv.setFloat32(o + 4, p.y, true); o += 8;
    }
  }
  return new Uint8Array(buf);
}

export function unpackFrames(bytes: Uint8Array): DrawFrame[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  const n = dv.getUint32(o, true); o += 4;
  const frames: DrawFrame[] = [];
  for (let i = 0; i < n; i++) {
    const frame = dv.getInt32(o, true); o += 4;
    const winner = dv.getInt16(o, true); o += 2;
    const resolvedFrame = dv.getInt32(o, true); o += 4;
    const cc = dv.getUint16(o, true); o += 2;
    const pc = dv.getUint16(o, true); o += 2;
    const cells: DrawCell[] = [];
    for (let k = 0; k < cc; k++) {
      const team = dv.getUint8(o); const hpFrac = dv.getUint8(o + 1) / 255; const dash = dv.getUint8(o + 2);
      const stunT = dv.getUint8(o + 3); const plagueT = dv.getUint8(o + 4); o += 5;
      const x = dv.getFloat32(o, true); const y = dv.getFloat32(o + 4, true);
      const vx = dv.getFloat32(o + 8, true); const vy = dv.getFloat32(o + 12, true); o += 16;
      // radius is reconstructed in the player from config (per-team constant); 0 here, set on draw.
      cells.push({ team, x, y, radius: 0, hpFrac, vx, vy, dash, stunT, plagueT });
    }
    const projectiles: DrawProj[] = [];
    for (let k = 0; k < pc; k++) {
      const team = dv.getUint8(o); o += 1;
      const x = dv.getFloat32(o, true); const y = dv.getFloat32(o + 4, true); o += 8;
      projectiles.push({ team, x, y });
    }
    frames.push({ frame, winner, resolvedFrame, cells, projectiles });
  }
  return frames;
}
