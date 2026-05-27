import { type World } from "../world";
/**
 * Per-cell movement: applies state-driven steering forces, then integrates
 * velocity/position with damping, velocity cap (x1.5 while dashing), and wall
 * bounce. Stunned cells skip steering and integrate with stronger damping.
 * AI decisions and ability velocity changes are handled in step.ts / abilities.
 */
export declare function movementSystem(w: World): void;
