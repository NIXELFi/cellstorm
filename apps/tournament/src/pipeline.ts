// Pass 2: render every planned segment to its own MP4 (identical encode params) and concat them into
// one finished file. The bracket/finale were fully decided in pass 1, so this is pure playback.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { frameDims } from "./format";
import { planSegments } from "./segments";
import { renderMatch } from "./render/renderMatch";
import { renderScene } from "./render/renderScene";
import { concatSegments } from "./assemble";
import { probeDurationSec } from "./render/ffmpeg";
import { DEFAULT_PACING, type ScenePacing } from "./pacing";
import type { MusicConfig, TournamentResult } from "./types";

export interface RenderTournamentOptions {
  outPath: string;
  /** Where the per-segment MP4s land (a temp dir by default). */
  workDir?: string;
  /** Keep the work dir (and its segment MP4s) instead of deleting it. */
  keep?: boolean;
  pacing?: ScenePacing;
  /** TEST-ONLY: cap each match clip to this many frames for fast low-cost renders (full renders omit it). */
  maxMatchFrames?: number;
  /** Optional background music mixed under the synth on fight clips only. */
  music?: MusicConfig;
  /** Optional lobby music for scenes (one track per scene, seeked to assigned offsets). */
  sceneMusic?: MusicConfig;
  /** Harness-decided intro headline. */
  title?: string;
  /** Path to a logo image (PNG) shown on the intro. */
  logoPath?: string;
  onSegment?: (info: { index: number; total: number; label: string }) => void;
  onMatchProgress?: (done: number, total: number) => void;
}

export async function renderTournament(result: TournamentResult, ro: RenderTournamentOptions): Promise<string> {
  const pacing = ro.pacing ?? DEFAULT_PACING;
  const d = frameDims(result.options.scale);
  const logoDataUri = ro.logoPath ? `data:image/png;base64,${readFileSync(ro.logoPath).toString("base64")}` : undefined;
  const segs = planSegments(result, pacing, { title: ro.title, logoDataUri });

  let music: { path: string; volume: number; durationSec: number } | undefined;
  if (ro.music) {
    music = { path: ro.music.path, volume: ro.music.volume, durationSec: await probeDurationSec(ro.music.path) };
  }

  const workDir = ro.workDir ?? mkdtempSync(join(tmpdir(), "cellstorm-tournament-"));
  mkdirSync(workDir, { recursive: true });
  const pad = (n: number) => String(n).padStart(3, "0");
  const segmentPaths: string[] = [];

  try {
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      const outPath = join(workDir, `${pad(i)}-${seg.label}.mp4`);
      ro.onSegment?.({ index: i, total: segs.length, label: seg.label });
      if (seg.kind === "match") {
        await renderMatch(seg.battle, seg.frame, d, result.options, outPath, ro.maxMatchFrames, music, ro.onMatchProgress);
      } else {
        const sm = ro.sceneMusic
          ? { path: ro.sceneMusic.path, offsetSec: seg.musicOffsetSec ?? 0, volume: ro.sceneMusic.volume }
          : undefined;
        await renderScene(seg.payload, seg.durationSec, d, result.options, outPath, sm);
      }
      segmentPaths.push(outPath);
    }
    await concatSegments(segmentPaths, ro.outPath);
  } finally {
    if (!ro.keep) rmSync(workDir, { recursive: true, force: true });
  }
  return ro.outPath;
}
