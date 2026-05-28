import type { BattleConfig, TeamCountSnapshot } from "./types";
import type { SimEvent } from "./events";
import { EventSink } from "./events";
import { createWorld, teamCounts } from "./world";
import { step } from "./step";

export interface BattleLog {
  config: BattleConfig;
  events: SimEvent[];
  timeline: TeamCountSnapshot[]; // sampled team counts
  durationTicks: number;
  winner: number;
}
export interface BattleSummary {
  winner: number;
  durationTicks: number;
  survivors: number;       // winner's surviving cell count
  resolved: boolean;       // true winner vs stalemate
}
const SAMPLE_EVERY = 6; // 10 samples/sec

export function runBattle(cfg: BattleConfig): { log: BattleLog; summary: BattleSummary } {
  const w = createWorld(cfg);
  const sink = new EventSink();
  const timeline: TeamCountSnapshot[] = [];
  let ended = false;
  while (!ended) {
    ended = step(w, sink);
    if (w.frame % SAMPLE_EVERY === 0 || ended) timeline.push({ tick: w.frame, counts: teamCounts(w) });
  }
  const counts = teamCounts(w);
  const survivors = w.winner >= 0 ? counts[w.winner]! : 0;
  return {
    log: { config: cfg, events: sink.events, timeline, durationTicks: w.frame, winner: w.winner },
    summary: { winner: w.winner, durationTicks: w.frame, survivors, resolved: w.winner >= 0 },
  };
}
