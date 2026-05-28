import { parseArgs } from "node:util";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { Store } from "./store";
import { runSweep } from "./runner";
import type { PowerAssignment, SweepSpec } from "./sweepSpec";

function stopFilePath(dbPath: string): string {
  return `${dbPath}.stop`;
}

function parsePowers(raw: string | undefined): PowerAssignment {
  if (!raw || raw === "random") return { mode: "random" };
  const names = raw.split(",").map((s) => s.trim()).filter(Boolean);
  // "pool:" prefix selects pool mode; otherwise fixed assignment.
  if (raw.startsWith("pool:")) {
    return { mode: "pool", pool: raw.slice(5).split(",").map((s) => s.trim()).filter(Boolean) };
  }
  return { mode: "fixed", names };
}

function parseSeeds(raw: string | undefined): { from: number; to: number } {
  if (!raw) return { from: 0, to: 99 };
  const m = /^(\d+)-(\d+)$/.exec(raw.trim());
  if (!m) throw new Error(`--seeds must be "from-to", got "${raw}"`);
  return { from: Number(m[1]), to: Number(m[2]) };
}

async function cmdSweep(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      db: { type: "string" },
      teams: { type: "string" },
      powers: { type: "string" },
      seeds: { type: "string" },
      batch: { type: "string" },
      concurrency: { type: "string" },
      topn: { type: "string" },
    },
  });
  const dbPath = values.db;
  if (!dbPath) throw new Error("--db is required");
  const teamCount = Number(values.teams ?? 4);
  const batchId = values.batch ?? `batch-${Date.now()}`;
  const concurrency = values.concurrency ? Number(values.concurrency) : undefined;
  const topNlogs = values.topn ? Number(values.topn) : undefined;

  const spec: SweepSpec = {
    teamCount,
    powers: parsePowers(values.powers),
    seeds: parseSeeds(values.seeds),
  };

  // Clear any stale stop file from a previous run.
  const stopPath = stopFilePath(dbPath);
  if (existsSync(stopPath)) rmSync(stopPath);

  process.stdout.write(`Sweep batch=${batchId} db=${dbPath} teams=${teamCount}\n`);
  let lastLine = "";
  await runSweep({
    spec,
    dbPath,
    batchId,
    concurrency,
    topNlogs,
    stopFlag: () => existsSync(stopPath),
    onProgress: (done, total, best) => {
      const line = `  ${done}/${total} done | best score ${best.toFixed(3)}`;
      if (line !== lastLine) {
        lastLine = line;
        process.stdout.write(`\r${line}`);
      }
    },
  });
  process.stdout.write("\nDone.\n");
  if (existsSync(stopPath)) {
    process.stdout.write("(stopped early via stop file)\n");
    rmSync(stopPath);
  }
}

function cmdList(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: { db: { type: "string" }, n: { type: "string" }, batch: { type: "string" } },
  });
  if (!values.db) throw new Error("--db is required");
  const n = values.n ? Number(values.n) : 10;
  const store = new Store(values.db);
  try {
    const rows = store.topN(n, values.batch);
    process.stdout.write(`Top ${rows.length} of ${store.count()} results:\n`);
    for (const r of rows) {
      const w = r.winner >= 0 ? `team ${r.winner}` : "stalemate";
      process.stdout.write(
        `  ${r.score.toFixed(3)}  ${r.config.powers.join(" vs ")}  seed=${r.config.seed}  ${w}  ${r.durationTicks}t\n`,
      );
    }
  } finally {
    store.close();
  }
}

function cmdStop(argv: string[]): void {
  const { values } = parseArgs({ args: argv, options: { db: { type: "string" } } });
  if (!values.db) throw new Error("--db is required");
  const stopPath = stopFilePath(values.db);
  writeFileSync(stopPath, String(Date.now()));
  process.stdout.write(`Stop requested: ${stopPath}\n`);
}

function usage(): void {
  process.stdout.write(
    [
      "Usage: cellstorm <command> [options]",
      "",
      "Commands:",
      "  sweep --db <path> [--teams N] [--powers random|a,b,c|pool:a,b,c]",
      "        [--seeds from-to] [--batch id] [--concurrency N] [--topn N]",
      "  list  --db <path> [--n N] [--batch id]",
      "  stop  --db <path>",
      "",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "sweep":
      await cmdSweep(rest);
      break;
    case "list":
      cmdList(rest);
      break;
    case "stop":
      cmdStop(rest);
      break;
    default:
      usage();
      if (cmd && cmd !== "help" && cmd !== "--help") process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
