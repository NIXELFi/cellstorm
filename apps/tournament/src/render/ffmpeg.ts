// Shared ffmpeg helpers: resolve the bundled binary (ffmpeg-static, falling back to a system ffmpeg)
// and run an argv to completion. Used by the landscape composite; the bundled binary needs no install.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";

export function resolveFfmpegBin(explicit?: string): string {
  if (explicit) return explicit;
  if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  return "ffmpeg";
}

export function runFfmpeg(args: string[], label = "ffmpeg"): Promise<void> {
  const bin = resolveFfmpegBin();
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "inherit"] });
    proc.on("error", (err) => reject(new Error(`failed to spawn ${label} (${bin}): ${err.message}`)));
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${label} exited with code ${code}`))));
  });
}

/** Read a media file's duration (seconds) by parsing `ffmpeg -i` stderr (no ffprobe needed). */
export function probeDurationSec(path: string): Promise<number> {
  const bin = resolveFfmpegBin();
  return new Promise<number>((resolve, reject) => {
    let err = "";
    const proc = spawn(bin, ["-i", path], { stdio: ["ignore", "ignore", "pipe"] });
    proc.stderr?.on("data", (d) => (err += String(d)));
    proc.on("error", (e) => reject(new Error(`failed to spawn ffmpeg (${bin}): ${e.message}`)));
    proc.on("close", () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return reject(new Error(`could not read duration of ${path}`));
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    });
  });
}
