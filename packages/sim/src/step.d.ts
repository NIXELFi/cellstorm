import { type World } from "./world";
import type { EventSink } from "./events";
/** Advance one fixed tick. Returns true when the battle has ended. */
export declare function step(w: World, sink: EventSink): boolean;
