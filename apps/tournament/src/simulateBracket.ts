// Pass 1: simulate the ENTIRE bracket before any rendering. Each match is the single highest-drama
// battle out of a swept seed range (scored with the existing score package); the winner of THAT
// battle advances. Reuses runBattle + score wholesale — no sim/scoring logic is reimplemented here.
import { runBattle, normalizeConfig } from "@cellstorm/sim";
import { score, DEFAULT_PROFILE, type ScoreProfile } from "@cellstorm/score";
import { deriveSeed, SALT_MATCH } from "./seed";
import { nextRoundEntrants } from "./bracket";
import type { ChosenBattle, DecidedBracket, Entrant, MatchResult, Round } from "./types";

/** team index for a 1v1 summary; anything other than 1 maps to 0 (stalemates are deprioritized by
 *  the scorer, so a chosen battle is virtually always resolved — this only avoids a bad cast). */
function teamOf(winner: number): 0 | 1 {
  return winner === 1 ? 1 : 0;
}

/** Quality tier: 2 = passed the drama gates (decisive + in the duration window), 1 = resolved (has a
 *  winner) but failed a gate, 0 = unresolved (stalemate / hit the tick cap). A capped fight is tier 0
 *  and must NEVER be chosen over a resolved one — picking a watchable, decisive fight is the whole
 *  point of sweeping many seeds. */
function tierOf(b: ChosenBattle): number {
  return b.drama.passed ? 2 : b.summary.resolved ? 1 : 0;
}

/** Distance (in ticks) from the target duration window; 0 if inside [targetMin, targetMax]. */
function windowDist(durTicks: number, profile: ScoreProfile): number {
  const min = profile.targetMinSec * profile.fps;
  const max = profile.targetMaxSec * profile.fps;
  if (durTicks < min) return min - durTicks;
  if (durTicks > max) return durTicks - max;
  return 0;
}

/**
 * Is `cand` a better pick than `inc`? Higher tier always wins (passed > resolved > unresolved). Within
 * the passed tier, higher drama score. Within the resolved/unresolved tiers (no useful drama signal),
 * the fight CLOSEST to the 15–40s window, then shorter, then lower seed. Consequence: a capped/unresolved
 * fight is only ever advanced if EVERY swept seed for the pairing was unresolved.
 */
export function betterBattle(cand: ChosenBattle, inc: ChosenBattle, profile: ScoreProfile): boolean {
  const tc = tierOf(cand);
  const ti = tierOf(inc);
  if (tc !== ti) return tc > ti;
  if (tc === 2) return cand.drama.score > inc.drama.score;
  const dc = windowDist(cand.summary.durationTicks, profile);
  const di = windowDist(inc.summary.durationTicks, profile);
  if (dc !== di) return dc < di;
  if (cand.summary.durationTicks !== inc.summary.durationTicks) {
    return cand.summary.durationTicks < inc.summary.durationTicks;
  }
  return cand.seed < inc.seed;
}

/** Sweep a 1v1 over `seedsPerMatch` seeds from `baseSeed` and return the best battle (see betterBattle). */
export function bestBattleForPairing(
  top: Entrant,
  bot: Entrant,
  baseSeed: number,
  seedsPerMatch: number,
  profile: ScoreProfile = DEFAULT_PROFILE,
): ChosenBattle {
  let best: ChosenBattle | null = null;
  for (let i = 0; i < seedsPerMatch; i++) {
    const seed = (baseSeed + i) >>> 0;
    const { log, summary } = runBattle(normalizeConfig({ seed, teamCount: 2, powers: [top, bot] }));
    const drama = score(log, profile);
    const winnerTeam = teamOf(summary.winner);
    const cand: ChosenBattle = { seed, powers: [top, bot], winnerTeam, winner: winnerTeam === 0 ? top : bot, drama, summary };
    if (best === null || betterBattle(cand, best, profile)) best = cand;
  }
  return best!; // seedsPerMatch >= 1 is enforced by runTournament
}

const ROUND_KEYS = ["ro16", "qf", "sf"] as const;

/** Run ro16 (8) -> qf (4) -> sf (2), organically advancing winners. Returns the decided bracket. */
export function simulateBracket(
  entrants: Entrant[],
  tournamentSeed: number,
  seedsPerMatch: number,
  profile: ScoreProfile = DEFAULT_PROFILE,
): DecidedBracket {
  const rounds: { ro16: MatchResult[]; qf: MatchResult[]; sf: MatchResult[] } = { ro16: [], qf: [], sf: [] };
  let field = entrants;

  ROUND_KEYS.forEach((round, roundIdx) => {
    const matchups = nextRoundEntrants(field);
    const winners: Entrant[] = [];
    matchups.forEach(([top, bot], matchIndex) => {
      const base = deriveSeed(tournamentSeed, SALT_MATCH, roundIdx, matchIndex);
      const chosen = bestBattleForPairing(top, bot, base, seedsPerMatch, profile);
      rounds[round].push({ ...chosen, round: round as Round, matchIndex });
      winners.push(chosen.winner);
    });
    field = winners;
  });

  return { entrants, rounds, finalists: [field[0]!, field[1]!] };
}
