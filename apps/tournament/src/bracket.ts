// Pure single-elimination bracket structure: adjacent-slot pairings and winner advancement. The
// seeded entrant order (from selectEntrants) fills the slots; round N's winners, in order, become
// round N+1's entrants.
import type { Entrant } from "./types";

/** Adjacent-slot pairings for a round of `n` entrants: [[0,1],[2,3],…]. `n` must be a positive even. */
export function pairingsFor(n: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < n; i += 2) pairs.push([i, i + 1]);
  return pairs;
}

/** The next round's matchups from an ordered winners list: adjacent winners meet. */
export function nextRoundEntrants(winners: Entrant[]): [Entrant, Entrant][] {
  const pairs: [Entrant, Entrant][] = [];
  for (let i = 0; i + 1 < winners.length; i += 2) pairs.push([winners[i]!, winners[i + 1]!]);
  return pairs;
}
