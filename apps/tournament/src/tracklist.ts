// HARDCODED lobby/scene-music tracklist — DO NOT LOSE. The scene music (assets/music/lobby-mix.mp3) is a
// ~53-minute mix of 20 tracks; each tournament scene plays ONE track, seeked to its start timestamp.
// Mirrored in docs/lobby-tracklist.md and CLAUDE.md (artist attribution). Keep all copies in sync.
import { makePrng, shuffle } from "@cellstorm/sim";

export interface LobbyTrack {
  /** Start offset into lobby-mix.mp3, in seconds. */
  startSec: number;
  title: string;
}

export const LOBBY_TRACKLIST: LobbyTrack[] = [
  { startSec: 0, title: "longing for AIR" }, // 00:00
  { startSec: 149, title: "nostalgic breakdown" }, // 2:29
  { startSec: 335, title: "Spring colors" }, // 5:35
  { startSec: 491, title: "公衆 Pool" }, // 8:11
  { startSec: 704, title: "Freeze Continent" }, // 11:44
  { startSec: 832, title: "Mesosphere" }, // 13:52
  { startSec: 959, title: "Bliss Boutique" }, // 15:59
  { startSec: 1067, title: "carousel.{iii}" }, // 17:47
  { startSec: 1123, title: "op234" }, // 18:43
  { startSec: 1380, title: "Swingin' Spathiphyllums" }, // 23:00
  { startSec: 1555, title: "Mount Amazing 2" }, // 25:55
  { startSec: 1683, title: "Re: Beautiful Morning" }, // 28:03
  { startSec: 1864, title: "UNITY" }, // 31:04
  { startSec: 2080, title: "Portable Picnic" }, // 34:40
  { startSec: 2200, title: "9°" }, // 36:40
  { startSec: 2491, title: "Distant Shore" }, // 41:31
  { startSec: 2660, title: "10 23 23 Sterile" }, // 44:20
  { startSec: 2857, title: "Injection || Midi Zone" }, // 47:37
  { startSec: 2994, title: "Plasma Lounge" }, // 49:54
  { startSec: 3170, title: "Love Theme" }, // 52:50
];

/**
 * Assign a lobby-track start offset (seconds) to each scene, in scene order:
 * scene 0 = first track, last scene = last track, all in-between = a seed-shuffled selection of the
 * MIDDLE tracks (never first/last), with no repeats (cycles only if there are more scenes than middle
 * tracks, which doesn't happen for a 16-power bracket). Deterministic in `seed`.
 */
export function assignSceneTracks(sceneCount: number, seed: number): number[] {
  if (sceneCount <= 0) return [];
  const first = LOBBY_TRACKLIST[0]!.startSec;
  const last = LOBBY_TRACKLIST[LOBBY_TRACKLIST.length - 1]!.startSec;
  if (sceneCount === 1) return [first];
  const middle = LOBBY_TRACKLIST.slice(1, -1).map((t) => t.startSec);
  const shuffled = shuffle(makePrng(seed), [...middle]);
  const out: number[] = [first];
  for (let i = 0; i < sceneCount - 2; i++) out.push(shuffled[i % shuffled.length]!);
  out.push(last);
  return out;
}
