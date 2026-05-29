// Library surface of @cellstorm/tournament. Importing this does NOT run the CLI (main is gated on
// direct invocation in cli.ts).
export { runTournament, DEFAULT_TOURNAMENT_OPTIONS } from "./tournament";
export { renderTournament } from "./pipeline";
export type { RenderTournamentOptions } from "./pipeline";
export { planSegments } from "./segments";
export type { Segment } from "./segments";
export { DEFAULT_PACING } from "./pacing";
export type { ScenePacing } from "./pacing";
export { selectEntrants, deriveSeed } from "./seed";
export { simulateBracket } from "./simulateBracket";
export { selectFinale } from "./finale";
export type {
  Entrant,
  Round,
  ChosenBattle,
  MatchResult,
  DecidedBracket,
  FinaleGame,
  FinaleResult,
  TournamentOptions,
  TournamentResult,
} from "./types";
