import type { BattleConfig, Cell, Corpse, Projectile, Power } from "./types";
import { type Prng } from "./prng";
export declare const GRID_SIZE = 14;
export declare const BASE_HP = 45;
export declare const BASE_RADIUS = 3;
export interface World {
    cfg: BattleConfig;
    prng: Prng;
    teamPowers: Power[];
    cells: Cell[];
    projectiles: Projectile[];
    corpses: Corpse[];
    pending: Cell[];
    grid: number[][];
    gw: number;
    gh: number;
    frame: number;
    nextId: number;
    winner: number;
    lastChangeFrame: number;
    prevTotal?: number;
}
export declare function makeCell(w: World, team: number, x: number, y: number): Cell;
export declare function createWorld(cfg: BattleConfig): World;
export declare function rebuildGrid(w: World): void;
export declare function teamCounts(w: World): number[];
