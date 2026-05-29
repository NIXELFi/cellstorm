// Builds the JSON payloads the browser scene bundle draws. The bracket "state" is reconstructed at
// each beat from the decided TournamentResult: matches up to a global index are revealed, later ones
// are TBD — so the bracket animation reflects real, already-decided outcomes (pass 1 ran first).
import { powerDesc } from "@cellstorm/render/descs";
import type { DecidedBracket, Entrant, Round, TournamentResult } from "../types";

/** Render-time branding fed into the intro (not part of the deterministic sim result). */
export interface Branding {
  title?: string;
  logoDataUri?: string;
}

export interface SceneMatch {
  round: Round;
  matchIndex: number;
  top: Entrant | null; // null = TBD (a feeding match isn't decided yet in this state)
  bot: Entrant | null;
  winnerTeam: 0 | 1 | null; // null = not yet played in this state
}
export interface BracketState {
  ro16: SceneMatch[];
  qf: SceneMatch[];
  sf: SceneMatch[];
  final: SceneMatch;
  champion: Entrant | null;
}
export interface RevealRef {
  round: Round;
  matchIndex: number;
}

export interface IntroPayload {
  kind: "intro";
  eyebrow: string; // brand line above the title
  title: string; // harness-decided headline
  logo: string | null; // logo image as a data URI (or null)
  entrants: Entrant[];
  bracket: BracketState;
}
export interface BeatPayload {
  kind: "beat";
  title: string;
  subtitle: string;
  bracket: BracketState;
  reveal: RevealRef | null;
}
export interface PodiumPayload {
  kind: "podium";
  title: string;
  champion: Entrant;
  runnerUp: Entrant;
  third: Entrant | null;
}
/** The static panel frame composited around a battle clip in the landscape layout. Carries DATA only;
 *  sceneEntry derives the panel geometry from the frame size via format.frameLayout(). */
export interface MatchFramePayload {
  kind: "matchframe";
  title: string; // round name, e.g. "QUARTERFINAL" / "FINAL · GAME 2"
  top: Entrant; // top competitor (team 0 / Red)
  bot: Entrant; // bottom competitor (team 1 / Blue)
  topDesc: string; // one-line power blurb
  botDesc: string;
  bracket: BracketState; // mini-bracket shown in the right panel
  score: { top: number; bot: number } | null; // series score for finale games (null for single matches)
  seed: number; // tournament seed, shown as a small ID
}
export type ScenePayload = IntroPayload | BeatPayload | PodiumPayload | MatchFramePayload;

const ROUND_TITLE: Record<Round, string> = {
  ro16: "ROUND OF 16",
  qf: "QUARTERFINAL",
  sf: "SEMIFINAL",
  final: "FINAL",
};

/** Global play-order index of a match. ro16:0-7, qf:8-11, sf:12-13, final:14. */
function gIndex(round: Round, m: number): number {
  if (round === "ro16") return m;
  if (round === "qf") return 8 + m;
  if (round === "sf") return 12 + m;
  return 14;
}
function isDecided(round: Round, m: number, upTo: number): boolean {
  return gIndex(round, m) <= upTo;
}
/** The winner of a ro16/qf/sf match, but only if that match is decided in the prefix (else null). */
function winnerIfDecided(b: DecidedBracket, round: Round, m: number, upTo: number): Entrant | null {
  if (round === "final") return null;
  const mr = b.rounds[round][m];
  return mr && isDecided(round, m, upTo) ? mr.winner : null;
}

/** Reconstruct the bracket as of global match `upTo` (-1 = nothing decided). */
function bracketStateUpTo(result: TournamentResult, upTo: number, championRevealed: boolean): BracketState {
  const b = result.bracket;
  const ro16 = b.rounds.ro16.map<SceneMatch>((mr, m) => ({
    round: "ro16",
    matchIndex: m,
    top: mr.powers[0],
    bot: mr.powers[1],
    winnerTeam: isDecided("ro16", m, upTo) ? mr.winnerTeam : null,
  }));
  const qf = b.rounds.qf.map<SceneMatch>((mr, m) => ({
    round: "qf",
    matchIndex: m,
    top: winnerIfDecided(b, "ro16", 2 * m, upTo),
    bot: winnerIfDecided(b, "ro16", 2 * m + 1, upTo),
    winnerTeam: isDecided("qf", m, upTo) ? mr.winnerTeam : null,
  }));
  const sf = b.rounds.sf.map<SceneMatch>((mr, m) => ({
    round: "sf",
    matchIndex: m,
    top: winnerIfDecided(b, "qf", 2 * m, upTo),
    bot: winnerIfDecided(b, "qf", 2 * m + 1, upTo),
    winnerTeam: isDecided("sf", m, upTo) ? mr.winnerTeam : null,
  }));
  const final: SceneMatch = {
    round: "final",
    matchIndex: 0,
    top: winnerIfDecided(b, "sf", 0, upTo),
    bot: winnerIfDecided(b, "sf", 1, upTo),
    winnerTeam: championRevealed ? ((result.finale.champion === b.finalists[0] ? 0 : 1) as 0 | 1) : null,
  };
  return { ro16, qf, sf, final, champion: championRevealed ? result.finale.champion : null };
}

export function buildIntroPayload(result: TournamentResult, branding: Branding = {}): IntroPayload {
  return {
    kind: "intro",
    eyebrow: "Cellstorm Championship",
    title: branding.title ?? "The Power Tournament",
    logo: branding.logoDataUri ?? null,
    entrants: result.bracket.entrants,
    bracket: bracketStateUpTo(result, -1, false),
  };
}

/** One beat per bracket match (ro16+qf+sf = 14), shown AFTER that match: the bracket state up to it,
 *  with the just-decided match flagged for the advancement animation. */
export function buildBeatPayloads(result: TournamentResult): BeatPayload[] {
  type BracketRoundKey = "ro16" | "qf" | "sf";
  const order: { round: BracketRoundKey; m: number }[] = [
    ...result.bracket.rounds.ro16.map((_, m) => ({ round: "ro16" as const, m })),
    ...result.bracket.rounds.qf.map((_, m) => ({ round: "qf" as const, m })),
    ...result.bracket.rounds.sf.map((_, m) => ({ round: "sf" as const, m })),
  ];
  return order.map(({ round, m }) => {
    const mr = result.bracket.rounds[round][m]!;
    return {
      kind: "beat",
      title: ROUND_TITLE[round],
      subtitle: `${mr.winner} advances`,
      bracket: bracketStateUpTo(result, gIndex(round, m), false),
      reveal: { round, matchIndex: m },
    };
  });
}

/** Finale score interstitial after `gamesPlayed` games, e.g. "Splitter 1 – 1 Berserker". */
export function buildFinaleScorePayload(result: TournamentResult, gamesPlayed: number): BeatPayload {
  const f = result.finale;
  let top = 0;
  let bot = 0;
  for (let i = 0; i < gamesPlayed && i < f.games.length; i++) {
    if (f.games[i]!.winnerTeam === 0) top++;
    else bot++;
  }
  const [a, b] = f.finalists;
  return {
    kind: "beat",
    title: "FINAL",
    subtitle: `${a} ${top} – ${bot} ${b}`,
    bracket: bracketStateUpTo(result, 13, false), // through SF; final still open
    reveal: null,
  };
}

/** Champion-crowned beat: full bracket decided, champion highlighted. */
export function buildChampionPayload(result: TournamentResult): BeatPayload {
  return {
    kind: "beat",
    title: "CHAMPION",
    subtitle: result.champion,
    bracket: bracketStateUpTo(result, 14, true),
    reveal: { round: "final", matchIndex: 0 },
  };
}

export function buildPodiumPayload(result: TournamentResult): PodiumPayload {
  return {
    kind: "podium",
    title: "PODIUM",
    champion: result.champion,
    runnerUp: result.runnerUp,
    third: result.third,
  };
}

/** Landscape side-panel frame for a bracket match: matchup + mini-bracket (this match shown as the
 *  active, still-undecided pairing) + the tournament seed ID. */
export function buildBracketMatchFrame(
  result: TournamentResult,
  round: "ro16" | "qf" | "sf",
  matchIndex: number,
): MatchFramePayload {
  const mr = result.bracket.rounds[round][matchIndex]!;
  return {
    kind: "matchframe",
    title: ROUND_TITLE[round],
    top: mr.powers[0],
    bot: mr.powers[1],
    topDesc: powerDesc(mr.powers[0]),
    botDesc: powerDesc(mr.powers[1]),
    bracket: bracketStateUpTo(result, gIndex(round, matchIndex) - 1, false),
    score: null,
    seed: result.seed,
  };
}

/** Landscape side-panel frame for a finale game: finalists + full bracket + the series score going INTO
 *  this game (wins from earlier games). */
export function buildFinaleMatchFrame(result: TournamentResult, gameIndex: number): MatchFramePayload {
  const f = result.finale;
  let top = 0;
  let bot = 0;
  for (let i = 0; i < gameIndex && i < f.games.length; i++) {
    if (f.games[i]!.winnerTeam === 0) top++;
    else bot++;
  }
  return {
    kind: "matchframe",
    title: `FINAL · GAME ${gameIndex + 1}`,
    top: f.finalists[0],
    bot: f.finalists[1],
    topDesc: powerDesc(f.finalists[0]),
    botDesc: powerDesc(f.finalists[1]),
    bracket: bracketStateUpTo(result, 13, false),
    score: { top, bot },
    seed: result.seed,
  };
}
