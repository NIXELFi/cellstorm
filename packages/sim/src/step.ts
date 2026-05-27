import { rebuildGrid, teamCounts, type World } from "./world";
import { decide } from "./ai";
import { movementSystem } from "./systems/movement";
import { abilitiesSystem } from "./systems/abilities";
import { collisionSystem } from "./systems/collision";
import { resolveSpawnsAndCompact } from "./systems/spawn";
import type { EventSink } from "./events";

const STALEMATE_TICKS = 60 * 12; // 12s of no elimination

/** Advance one fixed tick. Returns true when the battle has ended. */
export function step(w: World, sink: EventSink): boolean {
  w.frame++;
  sink.tick = w.frame;
  rebuildGrid(w);
  for (const c of w.cells) {
    if (c.alive && w.frame % 8 === c.aiPhase) decide(w, c);
  }
  movementSystem(w);
  abilitiesSystem(w, sink);
  collisionSystem(w, sink);
  resolveSpawnsAndCompact(w);

  const counts = teamCounts(w);
  const live = counts.filter((n) => n > 0).length;
  const totalAlive = counts.reduce((a, b) => a + b, 0);
  if (w.prevTotal === undefined || totalAlive !== w.prevTotal) {
    w.prevTotal = totalAlive; w.lastChangeFrame = w.frame;
  }
  if (live <= 1) {
    w.winner = live === 1 ? counts.findIndex((n) => n > 0) : -1;
    sink.end(w.winner);
    return true;
  }
  if (w.frame - w.lastChangeFrame > STALEMATE_TICKS || w.frame >= w.cfg.maxTicks) {
    w.winner = -1; // unresolved/stalemate
    sink.end(w.winner);
    return true;
  }
  return false;
}
