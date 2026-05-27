import { type World } from "../world";
import type { EventSink } from "../events";
/**
 * Status ticks (plague, regen) plus active abilities (shoot, charge, revive,
 * lifebloom aura) for non-stunned cells, followed by the team-wide magnet pull
 * pass. Stunned cells are skipped this frame (movement handles their drift).
 */
export declare function abilitiesSystem(w: World, sink: EventSink): void;
