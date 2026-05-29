// ffmpeg frames -> mp4. The argument construction is a PURE function (ffmpegArgs) so it can be
// unit-tested without spawning anything; encode() spawns the system ffmpeg with those args.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import type { MusicSettings } from "@cellstorm/audio";

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
/** A user-supplied music track to mix under the synth, with its on-disk path + final video length. */
export interface MusicMux {
  path: string;
  settings: MusicSettings;
  /** Final video length (s) so the music's fade-out lands at the video end. */
  videoDurationSec: number;
}

export function ffmpegArgs(
  framesDir: string,
  fps: number,
  outPath: string,
  audioPath?: string,
  audioOffsetSec = 0,
  video?: VideoOpts,
  music?: MusicMux,
): string[] {
  if (music?.settings.enabled) {
    return ffmpegArgsWithMusic(framesDir, fps, outPath, audioPath, audioOffsetSec, video, music);
  }
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

/**
 * ffmpeg argv when a user music track is mixed in. The track is `-ss`-seeked to its start point on
 * input, then volume-scaled, faded in (at its start) and out (so the fade ends at the video end),
 * and `adelay`-shifted to the chosen start offset in the video. With a synth track it's amix'd UNDER
 * it (normalize=0 keeps the synth at full level + adds the music); without one it becomes the sole
 * audio. The video is scaled inside the filtergraph (not -vf) since filter_complex is in play.
 */
function ffmpegArgsWithMusic(
  framesDir: string,
  fps: number,
  outPath: string,
  audioPath: string | undefined,
  audioOffsetSec: number,
  video: VideoOpts | undefined,
  music: MusicMux,
): string[] {
  const m = music.settings;
  const args = ["-y", "-framerate", String(fps), "-i", `${framesDir}/%06d.png`];
  let idx = 1;
  let synthIdx = -1;
  if (audioPath) {
    if (audioOffsetSec > 0) args.push("-itsoffset", String(audioOffsetSec));
    args.push("-i", audioPath);
    synthIdx = idx++;
  }
  if (m.startInTrackSec > 0) args.push("-ss", String(m.startInTrackSec));
  args.push("-i", music.path);
  const musicIdx = idx++;

  // Music is VIDEO-relative: startOffsetSec is measured from frame 0, so 0 plays over the cold-open
  // intro (matching the harness preview). The synth keeps its own separate teaser delay.
  const offMs = Math.max(0, Math.round(m.startOffsetSec * 1000));
  const playSec = Math.max(0, music.videoDurationSec - m.startOffsetSec); // how long music plays
  const fadeOutStart = Math.max(0, playSec - m.fadeOutSec);
  const chain = [`[${musicIdx}:a]volume=${m.volume}`];
  if (m.fadeInSec > 0) chain.push(`afade=t=in:st=0:d=${m.fadeInSec}`);
  if (m.fadeOutSec > 0) chain.push(`afade=t=out:st=${fadeOutStart}:d=${m.fadeOutSec}`);
  if (offMs > 0) chain.push(`adelay=${offMs}:all=1`);

  const filters: string[] = [];
  if (synthIdx >= 0) {
    filters.push(`${chain.join(",")}[mus]`);
    filters.push(`[${synthIdx}:a][mus]amix=inputs=2:normalize=0:duration=longest[aout]`);
  } else {
    filters.push(`${chain.join(",")}[aout]`);
  }

  let videoMap = "0:v";
  if (video?.scaleW && video?.scaleH) {
    filters.push(`[0:v]scale=${video.scaleW}:${video.scaleH}:flags=lanczos[vout]`);
    videoMap = "[vout]";
  }

  args.push("-filter_complex", filters.join(";"));
  args.push("-map", videoMap, "-map", "[aout]");
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
  if (video && (video.crf !== undefined || video.preset !== undefined)) {
    args.push("-crf", String(video.crf ?? CRF_DEFAULT), "-preset", video.preset ?? PRESET_DEFAULT, "-profile:v", "high");
  }
  args.push("-c:a", "aac", "-b:a", "192k", "-shortest", outPath);
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
  /** Optional user music track mixed under the synth. */
  music?: MusicMux;
}

/**
 * Spawn ffmpeg to encode the frame sequence. Resolves on exit code 0, rejects otherwise (or on a
 * spawn error, e.g. ffmpeg not installed).
 */
export function encode(opts: EncodeOptions): Promise<void> {
  const fps = opts.fps ?? 60;
  const bin = resolveFfmpegBin(opts.ffmpegPath);
  const args = ffmpegArgs(opts.framesDir, fps, opts.outPath, opts.audioPath, opts.audioOffsetSec ?? 0, opts.video, opts.music);
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
