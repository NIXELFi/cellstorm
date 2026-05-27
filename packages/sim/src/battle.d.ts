import type { BattleConfig, TeamCountSnapshot } from "./types";
import type { SimEvent } from "./events";
export interface BattleLog {
    config: BattleConfig;
    events: SimEvent[];
    timeline: TeamCountSnapshot[];
    durationTicks: number;
    winner: number;
}
export interface BattleSummary {
    winner: number;
    durationTicks: number;
    survivors: number;
    resolved: boolean;
}
export declare function runBattle(cfg: BattleConfig): {
    log: BattleLog;
    summary: BattleSummary;
};
