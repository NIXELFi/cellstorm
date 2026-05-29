// Render a scene (intro / bracket beat / podium) to an MP4 with a format-matched SILENT audio track,
// so it concatenates cleanly against the match clips. Uses the SAME encode() and the SAME video opts
// (crf, optional Lanczos downscale) and fps as renderMatch — identical codec/res/pixfmt/audio.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encode } from "@cellstorm/renderer";
import { captureScene } from "../scene/sceneCapture";
import { silentWavBytes } from "./silentWav";
import { runFfmpeg } from "./ffmpeg";
import type { Dims } from "../dims";
import type { ScenePayload } from "../scene/sceneData";
import type { TournamentOptions } from "../types";

export async function renderScene(
  payload: ScenePayload,
  durationSec: number,
  d: Dims,
  opts: TournamentOptions,
  outPath: string,
  music?: { path: string; offsetSec: number; volume: number },
): Promise<void> {
  const frames = Math.max(1, Math.round(durationSec * opts.fps));
  const framesDir = mkdtempSync(join(tmpdir(), "cellstorm-scene-"));
  try {
    await captureScene(payload, d, frames, framesDir);
    if (music) {
      // Lobby track for this scene: seek to the assigned track start, fade in/out, play under the scene.
      const fadeOut = Math.max(0.1, durationSec - 0.4);
      await runFfmpeg(
        [
          "-y",
          "-framerate", String(opts.fps), "-i", join(framesDir, "%06d.png"),
          "-ss", music.offsetSec.toFixed(2), "-i", music.path,
          "-filter_complex", `[1:a]volume=${music.volume},afade=t=in:st=0:d=0.4,afade=t=out:st=${fadeOut.toFixed(2)}:d=0.4[a]`,
          "-map", "0:v", "-map", "[a]", "-r", String(opts.fps),
          "-c:v", "libx264", "-crf", String(opts.crf), "-preset", "medium", "-profile:v", "high", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "192k", "-shortest", outPath,
        ],
        "ffmpeg scene",
      );
    } else {
      // Silent scene (format-matched WAV so concat audio stays continuous).
      const audioPath = join(framesDir, "audio.wav");
      writeFileSync(audioPath, silentWavBytes(frames / opts.fps));
      await encode({ framesDir, outPath, fps: opts.fps, audioPath, audioOffsetSec: 0, video: { crf: opts.crf } });
    }
  } finally {
    rmSync(framesDir, { recursive: true, force: true });
  }
}
