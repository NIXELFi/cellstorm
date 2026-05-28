import { rebuildGrid, teamCounts, type World } from "./world";
import { decide } from "./ai";
import { movementSystem } from "./systems/movement";
import { abilitiesSystem } from "./systems/abilities";
import { collisionSystem } from "./systems/collision";
import { resolveSpawnsAndCompact } from "./systems/spawn";
import type { EventSink } from "./events";

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

  // Lead-change detection: leader is the team with the max alive count.
  // On a tie, keep the previous leader to avoid churn.
  let max = -1, newLeader = w.leader;
  for (let t = 0; t < counts.length; t++) {
    const n = counts[t]!;
    if (n > max) { max = n; newLeader = t; }
  }
  if (max > 0 && newLeader !== w.leader) {
    w.leader = newLeader;
    sink.leadChange(newLeader);
  }

  // Stalemate detection: reset the timer only when a DEATH occurred since the
  // last tick. Spawning teams (Splitter/Necromancer) no longer keep the timer
  // alive just by changing the total alive count.
  if (w.deathCount > w.prevDeathCount) {
    w.prevDeathCount = w.deathCount; w.lastChangeFrame = w.frame;
  }
  if (live <= 1) {
    w.winner = live === 1 ? counts.findIndex((n) => n > 0) : -1;
    sink.end(w.winner);
    return true;
  }
  if (w.frame - w.lastChangeFrame > w.cfg.ai.stalemateTicks || w.frame >= w.cfg.maxTicks) {
    w.winner = -1; // unresolved/stalemate
    sink.end(w.winner);
    return true;
  }
  return false;
}
