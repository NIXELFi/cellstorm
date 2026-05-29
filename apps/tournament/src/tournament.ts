// Top-level orchestrator (PASS 1, pure data — no rendering). seed -> 16 entrants -> full bracket ->
// finale selection -> TournamentResult. Deterministic in (seed, options): same inputs reproduce the
// exact tournament; a new seed gives a completely different one.
import { runBattle, normalizeConfig } from "@cellstorm/sim";
import { score, DEFAULT_PROFILE, type ScoreProfile } from "@cellstorm/score";
import { selectEntrants, deriveSeed, SALT_FINALE } from "./seed";
import { simulateBracket } from "./simulateBracket";
import { selectFinale } from "./finale";
import type {
  ChosenBattle, DecidedBracket, Entrant, TournamentOptions, TournamentResult,
} from "./types";

export const DEFAULT_TOURNAMENT_OPTIONS: TournamentOptions = {
  seedsPerMatch: 100,
  finaleBudget: 300,
  scale: 1,
  supersample: 1,
  crf: 18,
  fps: 60,
  includeThird: true,
};

/** Sweep the finalist pairing over `budget` seeds; the finale selector picks the best-of-three. */
function sampleFinaleCandidates(
  finalists: [Entrant, Entrant],
  tournamentSeed: number,
  budget: number,
  profile: ScoreProfile,
): ChosenBattle[] {
  const [top, bot] = finalists;
  const base = deriveSeed(tournamentSeed, SALT_FINALE);
  const out: ChosenBattle[] = [];
  for (let i = 0; i < budget; i++) {
    const seed = (base + i) >>> 0;
    const { log, summary } = runBattle(normalizeConfig({ seed, teamCount: 2, powers: [top, bot] }));
    const drama = score(log, profile);
    const winnerTeam = (summary.winner === 1 ? 1 : 0) as 0 | 1;
    out.push({ seed, powers: [top, bot], winnerTeam, winner: winnerTeam === 0 ? top : bot, drama, summary });
  }
  return out;
}

/** Third place = the semifinal loser whose SF was the higher-drama match (the stronger run). */
function deriveThird(bracket: DecidedBracket): Entrant {
  const losers = bracket.rounds.sf.map((m) => ({
    entrant: m.winnerTeam === 0 ? m.powers[1] : m.powers[0],
    drama: m.drama.score,
  }));
  losers.sort((a, b) => b.drama - a.drama);
  return losers[0]!.entrant;
}

export function runTournament(
  seed: number,
  partial: Partial<TournamentOptions> = {},
  profile: ScoreProfile = DEFAULT_PROFILE,
): TournamentResult {
  const options: TournamentOptions = { ...DEFAULT_TOURNAMENT_OPTIONS, ...partial };
  if (options.seedsPerMatch < 1) throw new Error("seedsPerMatch must be >= 1");
  if (options.finaleBudget < 3) throw new Error("finaleBudget must be >= 3");

  const entrants = selectEntrants(seed);
  const bracket = simulateBracket(entrants, seed, options.seedsPerMatch, profile);
  const candidates = sampleFinaleCandidates(bracket.finalists, seed, options.finaleBudget, profile);
  const finale = selectFinale(bracket.finalists, candidates);
  const third = options.includeThird ? deriveThird(bracket) : null;

  return { seed, options, bracket, finale, champion: finale.champion, runnerUp: finale.runnerUp, third };
}
