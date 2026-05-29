// Finale selection: given all swept candidate battles for the finalist pairing, pick the best-of-three.
// This is the one place we deliberately select STRUCTURE for drama (each game is still a real, unedited
// battle). Pure — the I/O sweep lives in tournament.ts and hands the candidates here.
import type { ChosenBattle, Entrant, FinaleGame, FinaleResult } from "./types";

/** Descending sort: passed gate first, then higher drama score, then lower seed (stable). */
function byDramaDesc(a: ChosenBattle, b: ChosenBattle): number {
  if (a.drama.passed !== b.drama.passed) return a.drama.passed ? -1 : 1;
  if (b.drama.score !== a.drama.score) return b.drama.score - a.drama.score;
  return a.seed - b.seed;
}

function toGames(list: ChosenBattle[]): FinaleGame[] {
  return list.map((c, i) => ({ ...c, gameIndex: i }));
}

function otherFinalist(finalists: [Entrant, Entrant], champ: Entrant): Entrant {
  return finalists[0] === champ ? finalists[1] : finalists[0];
}

/** Champion of an honest best-of-three: whoever reaches two wins first, in play order. */
function firstToTwo(games: ChosenBattle[], finalists: [Entrant, Entrant]): Entrant {
  let top = 0;
  let bot = 0;
  for (const g of games) {
    if (g.winnerTeam === 0) top++;
    else bot++;
    if (top === 2) return finalists[0];
    if (bot === 2) return finalists[1];
  }
  return top >= bot ? finalists[0] : finalists[1];
}

/**
 * Preferred result: a 1-1 split into a decisive game three. We take the best decisive win for each
 * finalist (the split) plus the best remaining decisive battle as the climax — which maximizes the
 * combined drama subject to g1/g2 being a split and g3 decisive. Split games are ordered ascending
 * drama so the series builds; the champion is game three's winner.
 *
 * Fallback (a finalist never wins decisively within budget): the best honest best-of-three — the
 * three highest-drama decisive battles in drama order, champion = first to two wins.
 */
export function selectFinale(finalists: [Entrant, Entrant], candidates: ChosenBattle[]): FinaleResult {
  const decisive = candidates.filter((c) => c.summary.resolved);
  const winsTop = decisive.filter((c) => c.winnerTeam === 0).sort(byDramaDesc);
  const winsBot = decisive.filter((c) => c.winnerTeam === 1).sort(byDramaDesc);

  if (winsTop.length > 0 && winsBot.length > 0) {
    const a = winsTop[0]!;
    const b = winsBot[0]!;
    const used = new Set<number>([a.seed, b.seed]);
    const g3 = decisive.filter((c) => !used.has(c.seed)).sort(byDramaDesc)[0];
    if (g3) {
      const split = [a, b].sort((x, y) => x.drama.score - y.drama.score); // ascending → build-up
      const games = toGames([split[0]!, split[1]!, g3]);
      const champion = g3.winnerTeam === 0 ? finalists[0] : finalists[1];
      return { kind: "tiebreak", finalists, games, champion, runnerUp: otherFinalist(finalists, champion) };
    }
  }

  // Fallback: honest best-of-three.
  const pool = decisive.length >= 3 ? decisive : candidates;
  const ordered = pool.slice().sort(byDramaDesc).slice(0, 3);
  const champion = firstToTwo(ordered, finalists);
  return { kind: "honest", finalists, games: toGames(ordered), champion, runnerUp: otherFinalist(finalists, champion) };
}
