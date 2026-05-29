// Shared result + option types for the tournament harness. Pure data — the whole TournamentResult is
// a deterministic function of (seed, options), produced by pass 1 and consumed by pass-2 rendering.
import type { BattleSummary } from "@cellstorm/sim";
import type { DramaReport } from "@cellstorm/score";

/** A power name drawn from POWER_NAMES. */
export type Entrant = string;

export type Round = "ro16" | "qf" | "sf" | "final";

/** A single decided 1v1 battle, chosen as the best (highest drama) of a swept seed range.
 *  Convention: powers[0] is the TOP slot (team 0 / Red), powers[1] the BOTTOM slot (team 1 / Blue). */
export interface ChosenBattle {
  seed: number;
  powers: [Entrant, Entrant];
  winnerTeam: 0 | 1;
  winner: Entrant;
  drama: DramaReport;
  summary: BattleSummary;
}

export interface MatchResult extends ChosenBattle {
  round: Round;
  matchIndex: number;
}

export interface DecidedBracket {
  /** The 16 entrants in seeded slot order (slot i = entrants[i]). */
  entrants: Entrant[];
  rounds: { ro16: MatchResult[]; qf: MatchResult[]; sf: MatchResult[] };
  finalists: [Entrant, Entrant];
}

export interface FinaleGame extends ChosenBattle {
  /** 0-based position in the series, in play order. */
  gameIndex: number;
}

export interface FinaleResult {
  kind: "tiebreak" | "honest";
  finalists: [Entrant, Entrant];
  games: FinaleGame[];
  champion: Entrant;
  runnerUp: Entrant;
}

/** Optional background music for the fight clips (mixed under the synth SFX; off during scenes). */
export interface MusicConfig {
  path: string;
  volume: number;
}

export interface TournamentOptions {
  seedsPerMatch: number;
  finaleBudget: number;
  scale: number;
  supersample: number;
  crf: number;
  fps: number;
  includeThird: boolean;
}

export interface TournamentResult {
  seed: number;
  options: TournamentOptions;
  bracket: DecidedBracket;
  finale: FinaleResult;
  champion: Entrant;
  runnerUp: Entrant;
  third: Entrant | null;
}
