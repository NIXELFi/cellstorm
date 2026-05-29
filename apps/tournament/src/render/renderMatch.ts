// Render one match as a 16:9 LANDSCAPE clip: render the battle at its native portrait size (its own
// live top-strip + winner card kept, cold-open disabled), render the static broadcast panel frame once,
// then ffmpeg-overlays the battle (scaled to the centered battle box) onto the panel. The battle's synth
// audio is carried through. Output matches the scene clips' codec/res/fps/pixfmt/audio for clean concat.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeConfig } from "@cellstorm/sim";
import { renderBattle, encode } from "@cellstorm/renderer";
import { DEFAULT_HUD } from "@cellstorm/render/hud-config";
import { renderBattleAudioWav } from "@cellstorm/audio";
import { frameLayout, battleRenderWidth, type FrameDims } from "../format";
import { captureScene } from "../scene/sceneCapture";
import { runFfmpeg } from "./ffmpeg";
import { deriveSeed, SALT_MUSIC } from "../seed";
import type { ChosenBattle, TournamentOptions } from "../types";
import type { MatchFramePayload } from "../scene/sceneData";

export async function renderMatch(
  battle: ChosenBattle,
  frame: MatchFramePayload,
  d: FrameDims,
  opts: TournamentOptions,
  outPath: string,
  maxFrames?: number,
  music?: { path: string; volume: number; durationSec: number },
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), "cellstorm-match-"));
  try {
    const layout = frameLayout(d);

    // 1) Portrait battle clip (cold-open off; intro scrim off; live strip + winner card kept).
    const battleFrames = join(work, "battle");
    let totalFrames = 0;
    const result = await renderBattle({
      config: normalizeConfig({ seed: battle.seed, teamCount: 2, powers: battle.powers }),
      hud: { ...DEFAULT_HUD, showIntro: false },
      framesDir: battleFrames,
      width: battleRenderWidth(d),
      supersample: 1,
      opening: { enabled: false },
      onStart: (t) => {
        totalFrames = t;
        onProgress?.(0, t);
      },
      onProgress: (f) => onProgress?.(f, totalFrames),
      progressEvery: 120,
      ...(maxFrames ? { maxFrames } : {}),
    });
    const battleAudio = join(work, "battle.wav");
    writeFileSync(battleAudio, renderBattleAudioWav(result.log, opts.fps));
    const battleMp4 = join(work, "battle.mp4");
    await encode({
      framesDir: battleFrames,
      outPath: battleMp4,
      fps: opts.fps,
      audioPath: battleAudio,
      audioOffsetSec: 0,
      video: { crf: opts.crf },
    });

    // 2) Static broadcast panel frame (one screenshot at the full 16:9 frame size).
    const panelDir = join(work, "panel");
    await captureScene(frame, d, 1, panelDir);
    const panelPng = join(panelDir, "000000.png");

    // 3) Composite: overlay the battle (scaled to the battle box) onto the panel. Optionally mix the
    //    fight music UNDER the synth, seeked to a per-fight random (seed-derived) start offset, faded.
    const inputs = ["-loop", "1", "-framerate", String(opts.fps), "-i", panelPng, "-i", battleMp4];
    const filters = [
      `[1:v]scale=-2:${layout.battle.h}[bv]`,
      `[0:v][bv]overlay=x=${layout.battle.x}:y=${layout.battle.y}:shortest=1[v]`,
    ];
    let audioMap = "1:a";
    if (music) {
      const range = Math.max(1, music.durationSec - 45);
      const offset = (deriveSeed(battle.seed, SALT_MUSIC) / 0x1_0000_0000) * range;
      process.stdout.write(`    fight music @ ${offset.toFixed(0)}s (seed ${battle.seed})\n`);
      const clipDur = result.frameCount / opts.fps;
      const fadeOut = Math.max(0.1, clipDur - 0.45);
      inputs.push("-ss", offset.toFixed(2), "-i", music.path);
      filters.push(`[2:a]volume=${music.volume},afade=t=in:st=0:d=0.35,afade=t=out:st=${fadeOut.toFixed(2)}:d=0.45[mus]`);
      filters.push(`[1:a][mus]amix=inputs=2:normalize=0:duration=longest[aout]`);
      audioMap = "[aout]";
    }
    await runFfmpeg(
      [
        "-y",
        ...inputs,
        "-filter_complex", filters.join(";"),
        "-map", "[v]", "-map", audioMap,
        "-r", String(opts.fps),
        "-c:v", "libx264", "-crf", String(opts.crf), "-preset", "medium", "-profile:v", "high", "-pix_fmt", "yuv420p",
        // Pin output to the exact clip length so audio == video (prevents drift/desync across concat).
        "-c:a", "aac", "-b:a", "192k", "-t", (result.frameCount / opts.fps).toFixed(3),
        outPath,
      ],
      "ffmpeg composite",
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
