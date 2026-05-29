// The seed cascade: one tournamentSeed deterministically drives the whole tournament — which 16
// powers are in, their bracket seeding, and every match's swept seed range. All derivations go
// through makePrng so the result is reproducible and engine-independent on the Node side.
import { makePrng, shuffle, POWER_NAMES } from "@cellstorm/sim";

// Integer salts so derivations for different purposes never collide.
export const SALT_POWERS = 1;
export const SALT_SEEDING = 2;
export const SALT_MATCH = 3;
export const SALT_FINALE = 4;
export const SALT_MUSIC = 5;
export const SALT_LOBBY = 6;

/** Mix integer parts into a uint32 seed (FNV-1a-style) and run one mulberry32 step for diffusion, so
 *  adjacent inputs (matchIndex 0 vs 1) yield well-separated, stable, position-keyed seeds. */
export function deriveSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h ^= p | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
  }
  return Math.floor(makePrng(h >>> 0)() * 0x1_0000_0000) >>> 0;
}

/** Deterministically pick the 16 entrants: shuffle the 20 power names with a seed derived from the
 *  tournament seed, take the first 16. The shuffle order IS the bracket seeding (slot i = result[i]). */
export function selectEntrants(tournamentSeed: number): string[] {
  const prng = makePrng(deriveSeed(tournamentSeed, SALT_POWERS));
  return shuffle(prng, [...POWER_NAMES]).slice(0, 16);
}
