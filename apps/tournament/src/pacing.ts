// Scene durations (seconds) — PRESENTATION pacing only; match SELECTION is always best-content and is
// never affected by these. Bracket beats are snappy in the early rounds and longer for the semis/final;
// the podium gets the big moment. All tunable.
import type { Round } from "./types";

export interface ScenePacing {
  intro: number;
  beat: Record<Round, number>;
  finaleScore: number;
  champion: number;
  podium: number;
}

export const DEFAULT_PACING: ScenePacing = {
  intro: 5,
  beat: { ro16: 2.0, qf: 2.5, sf: 3.5, final: 3.5 },
  finaleScore: 2.5,
  champion: 4.0,
  podium: 7.0,
};
