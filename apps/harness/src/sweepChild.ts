// Child-process entry for a harness-launched sweep. The bridge server spawns this with tsx so
// the sweep runs INDEPENDENTLY of the HTTP request (and survives the request returning). It
// reports progress by writing a small JSON file the server polls, and honors the same stop
// file the CLI `stop` command writes (`${db}.stop`), which `runSweep`'s stopFlag checks.
//
// Invocation: tsx src/sweepChild.ts <jobJsonPath>
// where jobJsonPath is a temp file containing { spec, dbPath, batchId, concurrency, topNlogs, profile }.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { runSweep } from "@cellstorm/cli";
import type { SweepSpec } from "@cellstorm/cli";
import type { ScoreProfile } from "@cellstorm/score";

interface ChildJob {
  spec: SweepSpec;
  dbPath: string;
  batchId: string;
  concurrency?: number;
  topNlogs?: number;
  profile?: ScoreProfile;
  progressPath: string;
  stopPath: string;
}

async function main(): Promise<void> {
  const jobPath = process.argv[2];
  if (!jobPath) throw new Error("usage: sweepChild <jobJsonPath>");
  const job = JSON.parse(readFileSync(jobPath, "utf8")) as ChildJob;

  const writeProgress = (done: number, total: number, best: number, running: boolean) => {
    try {
      writeFileSync(job.progressPath, JSON.stringify({ done, total, best, running }));
    } catch {
      /* best-effort progress; never crash the sweep */
    }
  };

  writeProgress(0, 0, 0, true);

  await runSweep({
    spec: job.spec,
    dbPath: job.dbPath,
    batchId: job.batchId,
    concurrency: job.concurrency,
    topNlogs: job.topNlogs,
    profile: job.profile,
    stopFlag: () => existsSync(job.stopPath),
    onProgress: (done, total, best) => writeProgress(done, total, best, true),
  });

  // Final progress: read the last known numbers back so the harness sees done === total.
  let last = { done: 0, total: 0, best: 0 };
  try {
    last = JSON.parse(readFileSync(job.progressPath, "utf8")) as typeof last;
  } catch {
    /* ignore */
  }
  writeProgress(last.done, last.total, last.best, false);
}

main().catch((err) => {
  process.stderr.write(`sweepChild error: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exitCode = 1;
});
