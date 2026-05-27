import { type World } from "../world";
/**
 * Appends pending cells (splitter clones, necromancer revives), compacts dead
 * cells out of the array via swap-remove so hot loops only touch live cells,
 * and ages corpses out. Cell indices change here; the grid is rebuilt at the
 * start of the next step, so stale indices are never read.
 */
export declare function resolveSpawnsAndCompact(w: World): void;
