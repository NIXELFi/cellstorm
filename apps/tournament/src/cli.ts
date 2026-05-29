// tournament CLI — one command, one finished MP4:
//   tsx src/cli.ts --seed <N> --out tournament.mp4 [--seeds-per-match 100] [--finale-budget 300]
//                  [--scale 1] [--ss 1] [--crf 18] [--fps 60] [--no-third] [--keep] [--work <dir>]
// Simulates the whole bracket + finale (pass 1), then renders all clips/scenes and ffmpeg-concats them
// (pass 2). No manual step between invoking it and the finished file.
import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runTournament, DEFAULT_TOURNAMENT_OPTIONS } from "./tournament";
import { renderTournament } from "./pipeline";
import type { TournamentOptions } from "./types";

export interface TournamentCliArgs {
  seed?: string;
  out?: string;
  "seeds-per-match"?: string;
  "finale-budget"?: string;
  scale?: string;
  ss?: string;
  crf?: string;
  fps?: string;
  "no-third"?: boolean;
  keep?: boolean;
  work?: string;
  "max-match-frames"?: string;
  music?: string;
  "music-vol"?: string;
  "scene-music"?: string;
  "scene-music-vol"?: string;
  title?: string;
  logo?: string;
}

export function parseTournamentArgs(argv: string[]): TournamentCliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      seed: { type: "string" },
      out: { type: "string" },
      "seeds-per-match": { type: "string" },
      "finale-budget": { type: "string" },
      scale: { type: "string" },
      ss: { type: "string" },
      crf: { type: "string" },
      fps: { type: "string" },
      "no-third": { type: "boolean" },
      keep: { type: "boolean" },
      work: { type: "string" },
      "max-match-frames": { type: "string" },
      music: { type: "string" },
      "music-vol": { type: "string" },
      "scene-music": { type: "string" },
      "scene-music-vol": { type: "string" },
      title: { type: "string" },
      logo: { type: "string" },
    },
  });
  return values as TournamentCliArgs;
}

function num(v: string | undefined, fallback: number, name: string): number {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${name} must be a number, got "${v}"`);
  return n;
}

export function resolveOptions(args: TournamentCliArgs): Partial<TournamentOptions> {
  const d = DEFAULT_TOURNAMENT_OPTIONS;
  return {
    seedsPerMatch: num(args["seeds-per-match"], d.seedsPerMatch, "seeds-per-match"),
    finaleBudget: num(args["finale-budget"], d.finaleBudget, "finale-budget"),
    scale: num(args.scale, d.scale, "scale"),
    supersample: num(args.ss, d.supersample, "ss"),
    crf: num(args.crf, d.crf, "crf"),
    fps: num(args.fps, d.fps, "fps"),
    includeThird: !args["no-third"],
  };
}

async function main(argv: string[]): Promise<void> {
  const args = parseTournamentArgs(argv);
  if (args.seed === undefined) throw new Error("--seed <N> is required");
  if (!args.out) throw new Error("--out <path.mp4> is required");
  const seed = Number(args.seed);
  if (!Number.isFinite(seed)) throw new Error(`--seed must be a number, got "${args.seed}"`);

  const options = resolveOptions(args);
  process.stdout.write(
    `Tournament seed=${seed} (seedsPerMatch=${options.seedsPerMatch}, finaleBudget=${options.finaleBudget}) — simulating bracket...\n`,
  );
  const result = runTournament(seed, options);
  process.stdout.write(
    `  finalists: ${result.bracket.finalists.join(" vs ")} | finale: ${result.finale.kind} (${result.finale.games.length} games) | champion: ${result.champion}\n`,
  );

  // Music defaults to the repo's gitignored assets (epic on fights, lobby mix on scenes) unless overridden.
  const assetDir = join(import.meta.dirname, "..", "..", "..", "assets", "music");
  const pickMusic = (explicit: string | undefined, file: string): string | undefined => {
    if (explicit) return explicit;
    const p = join(assetDir, file);
    return existsSync(p) ? p : undefined;
  };
  const musicPath = pickMusic(args.music, "battle-epic-fight.mp3");
  const sceneMusicPath = pickMusic(args["scene-music"], "lobby-mix.mp3");
  process.stdout.write(`  music: fights=${musicPath ? "epic-fight" : "none"}  scenes=${sceneMusicPath ? "lobby-mix" : "none"}\n`);

  const startedAt = Date.now();
  const fmt = (s: number) => `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s`;

  await renderTournament(result, {
    outPath: args.out,
    keep: args.keep,
    workDir: args.work,
    maxMatchFrames: args["max-match-frames"] !== undefined ? num(args["max-match-frames"], 0, "max-match-frames") : undefined,
    music: musicPath ? { path: musicPath, volume: num(args["music-vol"], 0.6, "music-vol") } : undefined,
    sceneMusic: sceneMusicPath ? { path: sceneMusicPath, volume: num(args["scene-music-vol"], 0.55, "scene-music-vol") } : undefined,
    title: args.title,
    logoPath: args.logo,
    onSegment: ({ index, total, label }) => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const frac = index / total;
      const eta = frac > 0 ? elapsed / frac - elapsed : 0;
      process.stdout.write(
        `[${index + 1}/${total}] ${Math.round(frac * 100)}% ${label} | elapsed ${fmt(elapsed)}${frac > 0 ? ` | ETA ~${fmt(eta)}` : ""}\n`,
      );
    },
    onMatchProgress: (done, total) => {
      if (total > 0) process.stdout.write(`    battle ${done}/${total} frames\n`);
    },
  });
  process.stdout.write(`Done: ${args.out} — champion ${result.champion} (total ${fmt((Date.now() - startedAt) / 1000)})\n`);
}

// Run only when invoked directly (pathToFileURL so the check also holds on Windows). Mirrors the
// renderer CLI's guard so importing this module (e.g. in tests) doesn't kick off a render.
const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
