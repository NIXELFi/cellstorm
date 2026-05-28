import type { BattleLog } from "@cellstorm/sim";
import { type ScoreProfile, type DramaReport } from "./types";
import { runGates, components } from "./metrics";

export function score(log: BattleLog, profile: ScoreProfile): DramaReport {
  const reasons = runGates(log, profile);
  if (reasons.length) return { passed: false, score: 0, breakdown: {}, reasons };
  const comp = components(log, profile);
  const w = profile.weights;
  const total =
    comp.leadVolatility * w.leadVolatility +
    comp.comeback * w.comeback +
    comp.climaxTiming * w.climaxTiming +
    comp.closeFinish * w.closeFinish +
    comp.sustainedChaos * w.sustainedChaos;
  return { passed: true, score: total, breakdown: { ...comp }, reasons: [] };
}

export { runGates, components } from "./metrics";
export * from "./types";
