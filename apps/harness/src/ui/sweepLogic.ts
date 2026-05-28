// PURE logic shared by the sweep builder UI — assembling a SweepSpec from form state. Kept
// separate from the DOM code so it can be unit-tested without a browser (see test/sweepLogic.test.ts).

import type { SweepSpec, PowerAssignment } from "@cellstorm/cli";

/** A per-slot power selection in the builder form. */
export type SlotMode = "fixed" | "random" | "pool";

export interface SweepFormState {
  /** Pin a single team count, or sweep a list. */
  teamCountMode: "pin" | "sweep";
  teamCountPin: number;
  teamCountList: number[];
  /** How powers are chosen. "fixed" requires one name per team. */
  powerMode: SlotMode;
  fixedNames: string[]; // length should === effective teamCount when powerMode==="fixed"
  poolNames: string[]; // candidate pool when powerMode==="pool"
  /** Seed range (inclusive). */
  seedFrom: number;
  seedTo: number;
  limit?: number;
  totalCells?: number;
  concurrency?: number;
  topNlogs?: number;
}

export const DEFAULT_FORM: SweepFormState = {
  teamCountMode: "pin",
  teamCountPin: 3,
  teamCountList: [2, 3, 4],
  powerMode: "random",
  fixedNames: [],
  poolNames: [],
  seedFrom: 0,
  seedTo: 199,
  limit: undefined,
  totalCells: undefined,
  concurrency: 4,
  topNlogs: 25,
};

export function buildPowerAssignment(state: SweepFormState): PowerAssignment {
  switch (state.powerMode) {
    case "fixed":
      return { mode: "fixed", names: state.fixedNames };
    case "pool":
      return { mode: "pool", pool: state.poolNames };
    case "random":
    default:
      return { mode: "random" };
  }
}

/** Assemble a SweepSpec from form state. Throws on inconsistent input (caught by the UI). */
export function buildSweepSpec(state: SweepFormState): SweepSpec {
  const teamCount =
    state.teamCountMode === "pin" ? state.teamCountPin : [...state.teamCountList];

  if (state.teamCountMode === "sweep" && state.teamCountList.length === 0) {
    throw new Error("sweep mode needs at least one team count");
  }

  if (state.powerMode === "fixed") {
    const tc = state.teamCountMode === "pin" ? state.teamCountPin : state.teamCountList[0]!;
    if (state.fixedNames.length !== tc) {
      throw new Error(`fixed mode needs exactly ${tc} power names, got ${state.fixedNames.length}`);
    }
  }
  if (state.powerMode === "pool" && state.poolNames.length === 0) {
    throw new Error("pool mode needs at least one power in the pool");
  }
  if (state.seedTo < state.seedFrom) {
    throw new Error("seed 'to' must be >= 'from'");
  }

  const spec: SweepSpec = {
    teamCount,
    powers: buildPowerAssignment(state),
    seeds: { from: state.seedFrom, to: state.seedTo },
  };
  if (state.limit != null) spec.limit = state.limit;
  if (state.totalCells != null) spec.totalCells = state.totalCells;
  return spec;
}

/** Count of configs the spec will expand to (before the limit cap), for the form readout. */
export function estimateRuns(state: SweepFormState): number {
  const seeds = Math.max(0, state.seedTo - state.seedFrom + 1);
  const tcs = state.teamCountMode === "pin" ? 1 : state.teamCountList.length;
  const raw = seeds * tcs;
  return state.limit != null ? Math.min(raw, state.limit) : raw;
}
