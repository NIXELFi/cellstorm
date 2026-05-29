// Final assembly: stitch the ordered segment MP4s into one file with the ffmpeg concat demuxer. The
// (already-uniform) H.264 VIDEO is stream-copied — lossless and fast, which matters for the 4K master.
// The AUDIO is RE-ENCODED: per-segment AAC encoder priming/padding makes `-c:a copy` emit
// "Non-monotonous DTS" at every segment seam (audible glitch / progressive desync); decoding the
// concatenated audio and writing one continuous AAC stream fixes it without touching the video.
// (Uniform video codec/res/fps/pixfmt across segments — from dims.ts + the shared encode() — is what
// lets the video copy cleanly in the first place.)
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";

/** Concat-demuxer list body. Single quotes in paths are escaped per ffmpeg's '\'' convention. */
export function concatListContent(paths: string[]): string {
  return paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n") + "\n";
}

function resolveFfmpeg(explicit?: string): string {
  if (explicit) return explicit;
  if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  return "ffmpeg";
}

/** Concatenate `paths` (in order) into `outPath`. Resolves on ffmpeg exit 0, rejects otherwise. */
export function concatSegments(paths: string[], outPath: string, ffmpegPath?: string): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "cellstorm-concat-"));
  const listPath = join(dir, "list.txt");
  writeFileSync(listPath, concatListContent(paths));
  const bin = resolveFfmpeg(ffmpegPath);
  const args = ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", outPath];
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "inherit"] });
    proc.on("error", (err) => {
      cleanup();
      reject(new Error(`failed to spawn ffmpeg (${bin}): ${err.message}`));
    });
    proc.on("close", (code) => {
      cleanup();
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg concat exited with code ${code}`));
    });
  });
}
