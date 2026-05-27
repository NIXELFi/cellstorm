import type { BattleLog } from "@cellstorm/sim";
export type { BattleLog };

export interface ScoreProfile {
  targetMinSec: number;   // default 30
  targetMaxSec: number;   // default 60
  fps: number;            // 60
  maxStalemateSec: number;// dead-air gate, default 8
  weights: {
    leadVolatility: number;
    comeback: number;
    climaxTiming: number;
    closeFinish: number;
    sustainedChaos: number;
  };
}

export const DEFAULT_PROFILE: ScoreProfile = {
  targetMinSec: 30, targetMaxSec: 60, fps: 60, maxStalemateSec: 8,
  weights: { leadVolatility: 1, comeback: 1.5, climaxTiming: 1, closeFinish: 1, sustainedChaos: 0.5 },
};

export interface DramaReport {
  passed: boolean;
  score: number;                       // weighted sum, 0..(sum of weights)
  breakdown: Record<string, number>;   // each component 0..1 + gate flags
  reasons: string[];                   // why it failed gates, if any
}
