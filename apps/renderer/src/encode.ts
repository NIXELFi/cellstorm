// ffmpeg frames -> mp4. The argument construction is a PURE function (ffmpegArgs) so it can be
// unit-tested without spawning anything; encode() spawns the system ffmpeg with those args.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";

// Encode-quality defaults: a clean, high-quality H.264 source so YouTube's re-encode doesn't mush
// the fine particles/glow/motion. CRF 18 ≈ visually lossless; "high" profile + yuv420p stay broadly
// playable. Tunable per call.
export const CRF_DEFAULT = 18;
export const PRESET_DEFAULT = "medium";

/** Optional video-quality knobs for the encode. */
export interface VideoOpts {
  /** Downscale target width (e.g. supersampled frames -> output). Adds a Lanczos scale filter. */
  scaleW?: number;
  scaleH?: number;
  /** H.264 constant rate factor (lower = higher quality/bigger). Defaults to CRF_DEFAULT. */
  crf?: number;
  /** x264 preset (speed/size tradeoff). Defaults to PRESET_DEFAULT. */
  preset?: string;
}

/**
 * Resolve the ffmpeg binary. An explicit path wins; otherwise prefer the bundled `ffmpeg-static`
 * binary (a real ffmpeg shipped per-platform via npm — no system install or PATH setup, so renders
 * work out of the box on macOS AND Windows); fall back to a system `ffmpeg` on PATH if for some
 * reason the static binary isn't present.
 */
export function resolveFfmpegBin(explicit?: string): string {
  if (explicit) return explicit;
  if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  return "ffmpeg";
}

/**
 * Build the ffmpeg argv to encode a PNG frame sequence into an H.264 MP4.
 *
 * Frames are read as `<framesDir>/%06d.png` at `fps` and written to `outPath`. yuv420p keeps the
 * output broadly playable (QuickTime / browsers / YouTube). When `audioPath` is given it's added as
 * a second input and encoded to AAC; `-shortest` trims the (slightly longer) audio to the video.
 *
 * `audioOffsetSec` delays the audio by that many seconds via `-itsoffset` — used so the soundtrack
 * (scored from the battle) starts at the cut to t=0, after the silent flash-forward teaser, keeping
 * audio and battle visuals in sync. The teaser plays clean (silent).
 */
export function ffmpegArgs(
  framesDir: string,
  fps: number,
  outPath: string,
  audioPath?: string,
  audioOffsetSec = 0,
  video?: VideoOpts,
): string[] {
  const args = ["-y", "-framerate", String(fps), "-i", `${framesDir}/%06d.png`];
  if (audioPath) {
    if (audioOffsetSec > 0) args.push("-itsoffset", String(audioOffsetSec));
    args.push("-i", audioPath);
  }
  args.push("-c:v", "libx264");
  // Downscale supersampled frames to the output size with a high-quality Lanczos filter.
  if (video?.scaleW && video?.scaleH) {
    args.push("-vf", `scale=${video.scaleW}:${video.scaleH}:flags=lanczos`);
  }
  args.push("-pix_fmt", "yuv420p");
  // High-quality H.264 source (only when quality opts are requested, so the bare call is unchanged).
  if (video && (video.crf !== undefined || video.preset !== undefined)) {
    args.push(
      "-crf", String(video.crf ?? CRF_DEFAULT),
      "-preset", video.preset ?? PRESET_DEFAULT,
      "-profile:v", "high",
    );
  }
  if (audioPath) args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
  args.push(outPath);
  return args;
}

export interface EncodeOptions {
  framesDir: string;
  outPath: string;
  fps?: number;
  ffmpegPath?: string;
  /** Optional audio track (WAV) to mux into the MP4. */
  audioPath?: string;
  /** Delay the audio by this many seconds (the flash-forward teaser length) so it starts at t=0. */
  audioOffsetSec?: number;
  /** Forward ffmpeg stderr to this stream (default process.stderr). Pass null to silence. */
  log?: NodeJS.WritableStream | null;
  /** Video-quality knobs (Lanczos downscale + CRF/preset). */
  video?: VideoOpts;
}

/**
 * Spawn ffmpeg to encode the frame sequence. Resolves on exit code 0, rejects otherwise (or on a
 * spawn error, e.g. ffmpeg not installed).
 */
export function encode(opts: EncodeOptions): Promise<void> {
  const fps = opts.fps ?? 60;
  const bin = resolveFfmpegBin(opts.ffmpegPath);
  const args = ffmpegArgs(opts.framesDir, fps, opts.outPath, opts.audioPath, opts.audioOffsetSec ?? 0, opts.video);
  const log = opts.log === undefined ? process.stderr : opts.log;

  return new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", log ? "pipe" : "ignore"] });
    if (log && proc.stderr) proc.stderr.pipe(log);
    proc.on("error", (err) => reject(new Error(`failed to spawn ffmpeg (${bin}): ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}
