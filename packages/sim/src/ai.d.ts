import type { Cell } from "./types";
import { type World } from "./world";
/** Run the perception scan + state selection for one cell. Caller gates on aiPhase. */
export declare function decide(w: World, c: Cell): void;
