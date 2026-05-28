import { parseArgs } from "node:util";
import { runBattle, normalizeConfig, POWER_NAMES, type BattleConfigInput } from "@cellstorm/sim";
import { DEFAULT_PROFILE, type ScoreProfile } from "@cellstorm/score";
import { roundRobin, LAB_TOTAL_CELLS } from "./roundRobin";
import { balanceReport } from "./balance";
import { snapshot, DEFAULT_SNAPSHOT_CONFIGS } from "./snapshot";
import { scoreDiff } from "./scoreDiff";

/* ------------------------------- table formatter ------------------------------ */

/** Render a simple aligned ASCII table. Numbers right-aligned, text left. */
function table(headers: string[], rows: (string | number)[][]): string {
  const fmt = (v: string | number) =>
    typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : v;
  const isNum = headers.map((_, c) => rows.every((r) => typeof r[c] === "number"));
  const cells = rows.map((r) => r.map(fmt));
  const widths = headers.map((h, c) =>
    Math.max(h.length, ...cells.map((r) => (r[c] ?? "").length)),
  );
  const pad = (s: string, w: number, right: boolean) =>
    right ? s.padStart(w) : s.padEnd(w);
  const line = (vals: string[]) =>
    "| " + vals.map((v, c) => pad(v, widths[c]!, isNum[c]!)).join(" | ") + " |";
  const sep = "+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+";
  return [sep, line(headers), sep, ...cells.map(line), sep].join("\n");
}

/* --------------------------------- subcommands -------------------------------- */

function cmdRoundRobin(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      powers: { type: "string" },
      seeds: { type: "string", default: "4" },
    },
  });
  const powers = (values.powers ?? "Tank,Glasshammer,Plague").split(",").map((s) => s.trim());
  const seeds = Number(values.seeds);
  console.log(`Round-robin: ${powers.join(", ")}  (${seeds} seeds/pair, ${LAB_TOTAL_CELLS} cells)\n`);
  const res = roundRobin(powers, { seeds });

  // Matrix: row = team-0 power, col = team-1 power, cell = winRate(row vs col).
  const headers = ["a \\ b", ...powers];
  const rows = powers.map((a) => [
    a,
    ...powers.map((b) => (a === b ? "-" : res.winRate(a, b))),
  ]);
  console.log(table(headers, rows));
  console.log("\nCell = fraction of battles row-power (team 0) beat col-power (team 1).");
}

function cmdBalance(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      teams: { type: "string", default: "2" },
      seeds: { type: "string", default: "6" },
      powers: { type: "string" },
    },
  });
  const teamCount = Number(values.teams);
  const seeds = Number(values.seeds);
  const powers = values.powers ? values.powers.split(",").map((s) => s.trim()) : undefined;
  console.log(`Balance sweep: ${seeds} battles, ${teamCount} teams, ${LAB_TOTAL_CELLS} cells\n`);
  const stats = balanceReport({ teamCount, seeds, powers });

  const rows = stats.map((s) => [
    s.power,
    s.battles,
    s.winRate,
    s.stalemateRate,
    s.avgDurationTicks,
  ]);
  console.log(table(["power", "battles", "winRate", "stalemate", "avgTicks"], rows));
}

function cmdSnapshot(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: { configs: { type: "string" } },
  });
  let configs: BattleConfigInput[];
  if (values.configs) {
    configs = JSON.parse(values.configs) as BattleConfigInput[];
  } else {
    configs = DEFAULT_SNAPSHOT_CONFIGS;
    console.log("Using built-in default config set.\n");
  }
  const entries = snapshot(configs);
  const rows = entries.map((e) => [
    e.configId,
    e.winner === -1 ? "stalemate" : `team ${e.winner}`,
    e.durationTicks,
  ]);
  console.log(table(["configId", "winner", "durationTicks"], rows));
}

function cmdScoreDiff(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: { configs: { type: "string" } },
  });
  const configs: BattleConfigInput[] = values.configs
    ? (JSON.parse(values.configs) as BattleConfigInput[])
    : DEFAULT_SNAPSHOT_CONFIGS;

  // Profile A = default. Profile B = a "comeback-heavy, longer" variant, to show
  // how rankings shift when the drama weights change.
  const profileA: ScoreProfile = DEFAULT_PROFILE;
  const profileB: ScoreProfile = {
    ...DEFAULT_PROFILE,
    targetMinSec: 5,
    targetMaxSec: 75,
    maxStalemateSec: 20,
    weights: { leadVolatility: 0.5, comeback: 3, climaxTiming: 0.5, closeFinish: 2, sustainedChaos: 0.25 },
  };

  const logs = configs.map((input) => {
    const cfg = normalizeConfig({ totalCells: LAB_TOTAL_CELLS, ...input });
    return runBattle(cfg).log;
  });

  console.log("Score diff: profile A (default) vs profile B (comeback-heavy)\n");
  const diff = scoreDiff(logs, profileA, profileB);
  const rank = (n: number) => (n === 0 ? "-" : n);
  const rows = diff.map((d) => [
    d.configId,
    d.scoreA,
    d.scoreB,
    rank(d.rankA),
    rank(d.rankB),
    d.rankDelta,
  ]);
  console.log(table(["configId", "scoreA", "scoreB", "rankA", "rankB", "rankDelta"], rows));
  console.log("\nrankDelta > 0 => profile B ranks the battle higher than profile A.");
}

/* ----------------------------------- entry ------------------------------------ */

function usage(): void {
  console.log(`@cellstorm/lab — dev experimentation workbench

Usage: lab <command> [options]

Commands:
  roundrobin  --powers a,b,c --seeds N      power-vs-power win-rate matrix
  balance     --teams N --seeds N [--powers a,b,...]   per-power analytics sweep
  snapshot    [--configs <json>]            regression snapshot (deterministic)
  scorediff   [--configs <json>]            compare two ScoreProfiles' rankings

Available powers: ${POWER_NAMES.join(", ")}`);
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "roundrobin": return cmdRoundRobin(rest);
    case "balance": return cmdBalance(rest);
    case "snapshot": return cmdSnapshot(rest);
    case "scorediff": return cmdScoreDiff(rest);
    default:
      usage();
      if (cmd && cmd !== "help" && cmd !== "--help") process.exitCode = 1;
  }
}

main();
