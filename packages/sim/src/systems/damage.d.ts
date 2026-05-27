import type { Cell } from "../types";
import { type World } from "../world";
import type { EventSink } from "../events";
export declare function handleDeath(w: World, sink: EventSink, c: Cell, killer: Cell | null): void;
export declare function explode(w: World, sink: EventSink, x: number, y: number, killerTeam: number): void;
export declare function applyDamage(w: World, sink: EventSink, attacker: Cell | null, target: Cell, base: number): void;
