import { type World } from "../world";
import type { EventSink } from "../events";
/**
 * Moves projectiles, resolves projectile-cell hits, then resolves cell-cell
 * overlap (positional push + cross-team melee damage with charge burst).
 */
export declare function collisionSystem(w: World, sink: EventSink): void;
