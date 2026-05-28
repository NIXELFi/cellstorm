// ffmpeg frames -> mp4. The argument construction is a PURE function (ffmpegArgs) so it can be
// unit-tested without spawning anything; encode() spawns the system ffmpeg with those args.

import { spawn } from "node:child_process";

/**
 * Build the ffmpeg argv to encode a PNG frame sequence into an H.264 MP4.
 *
 * Frames are read as `<framesDir>/%06d.png` at `fps` and written to `outPath`. yuv420p keeps the
 * output broadly playable (QuickTime / browsers / YouTube).
 */
export function ffmpegArgs(framesDir: string, fps: number, outPath: string): string[] {
  return [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    `${framesDir}/%06d.png`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    outPath,
  ];
}

export interface EncodeOptions {
  framesDir: string;
  outPath: string;
  fps?: number;
  ffmpegPath?: string;
  /** Forward ffmpeg stderr to this stream (default process.stderr). Pass null to silence. */
  log?: NodeJS.WritableStream | null;
}

/**
 * Spawn ffmpeg to encode the frame sequence. Resolves on exit code 0, rejects otherwise (or on a
 * spawn error, e.g. ffmpeg not installed).
 */
export function encode(opts: EncodeOptions): Promise<void> {
  const fps = opts.fps ?? 60;
  const bin = opts.ffmpegPath ?? "ffmpeg";
  const args = ffmpegArgs(opts.framesDir, fps, opts.outPath);
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
