import type { BattleConfig } from "./types";
export declare const DEFAULTS: {
    readonly totalCells: 900;
    readonly arena: {
        readonly width: 280;
        readonly height: 498;
    };
    readonly maxTicks: number;
};
export type BattleConfigInput = Pick<BattleConfig, "seed" | "teamCount" | "powers"> & Partial<BattleConfig>;
export declare function normalizeConfig(input: BattleConfigInput): BattleConfig;
