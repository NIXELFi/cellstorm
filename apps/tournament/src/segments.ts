// The ordered segment list for the final video (PURE — no rendering). Order:
//   intro, then for each bracket match [match clip, bracket beat] up the rounds, then the finale games
//   in order with score interstitials between them, then the champion beat, then the podium.
import {
  buildIntroPayload,
  buildBeatPayloads,
  buildFinaleScorePayload,
  buildChampionPayload,
  buildPodiumPayload,
  buildBracketMatchFrame,
  buildFinaleMatchFrame,
  type ScenePayload,
  type MatchFramePayload,
  type Branding,
} from "./scene/sceneData";
import { DEFAULT_PACING, type ScenePacing } from "./pacing";
import { assignSceneTracks } from "./tracklist";
import { deriveSeed, SALT_LOBBY } from "./seed";
import type { ChosenBattle, Round, TournamentResult } from "./types";

export type Segment =
  | { kind: "match"; battle: ChosenBattle; frame: MatchFramePayload; label: string }
  | { kind: "scene"; payload: ScenePayload; durationSec: number; label: string; musicOffsetSec?: number };

export function planSegments(result: TournamentResult, pacing: ScenePacing = DEFAULT_PACING, branding: Branding = {}): Segment[] {
  const beats = buildBeatPayloads(result); // 14: ro16[0-7], qf[8-11], sf[12-13]
  const segs: Segment[] = [];

  segs.push({ kind: "scene", payload: buildIntroPayload(result, branding), durationSec: pacing.intro, label: "intro" });

  const rounds: { key: Round; beatBase: number; beatDur: number }[] = [
    { key: "ro16", beatBase: 0, beatDur: pacing.beat.ro16 },
    { key: "qf", beatBase: 8, beatDur: pacing.beat.qf },
    { key: "sf", beatBase: 12, beatDur: pacing.beat.sf },
  ];
  for (const r of rounds) {
    const matches = result.bracket.rounds[r.key as "ro16" | "qf" | "sf"];
    matches.forEach((m, i) => {
      const frame = buildBracketMatchFrame(result, r.key as "ro16" | "qf" | "sf", i);
      segs.push({ kind: "match", battle: m, frame, label: `${r.key}-m${i}` });
      segs.push({ kind: "scene", payload: beats[r.beatBase + i]!, durationSec: r.beatDur, label: `${r.key}-beat${i}` });
    });
  }

  const games = result.finale.games;
  games.forEach((g, i) => {
    segs.push({ kind: "match", battle: g, frame: buildFinaleMatchFrame(result, i), label: `final-g${i + 1}` });
    if (i < games.length - 1) {
      segs.push({
        kind: "scene",
        payload: buildFinaleScorePayload(result, i + 1),
        durationSec: pacing.finaleScore,
        label: `final-score${i + 1}`,
      });
    }
  });

  segs.push({ kind: "scene", payload: buildChampionPayload(result), durationSec: pacing.champion, label: "champion" });
  segs.push({ kind: "scene", payload: buildPodiumPayload(result), durationSec: pacing.podium, label: "podium" });

  // Assign each scene a lobby-music track start (intro=first, podium=last, middle=random no-repeat).
  const sceneIdx = segs.flatMap((s, i) => (s.kind === "scene" ? [i] : []));
  const offsets = assignSceneTracks(sceneIdx.length, deriveSeed(result.seed, SALT_LOBBY));
  sceneIdx.forEach((idx, k) => {
    const seg = segs[idx]!;
    if (seg.kind === "scene") seg.musicOffsetSec = offsets[k];
  });

  return segs;
}
