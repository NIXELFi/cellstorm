import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import type { BattleConfig } from "@cellstorm/sim";
import type { ScoreProfile } from "@cellstorm/score";
import { expand, type SweepSpec } from "./sweepSpec";
import { Store, configId, type ResultRow } from "./store";
import { runOne, type WorkerResult, type WorkerTask } from "./worker";

export interface SweepJob {
  spec: SweepSpec;
  dbPath: string;
  batchId: string;
  concurrency?: number;
  topNlogs?: number;
  profile?: ScoreProfile;
  stopFlag?: () => boolean;
  onProgress?: (done: number, total: number, best: number) => void;
}

const FLUSH_EVERY = 200;

function resultRow(batchId: string, r: WorkerResult): ResultRow {
  return {
    configId: configId(r.config),
    config: r.config,
    score: r.report.score,
    breakdown: r.report.breakdown,
    winner: r.summary.winner,
    durationTicks: r.summary.durationTicks,
    batchId,
  };
}

/**
 * Whether tsx's programmatic ESM loader is resolvable. The worker bootstrap
 * (worker-bootstrap.mjs) imports `tsx/esm/api`; if that package isn't installed
 * we can't run real worker threads and fall back to inline execution.
 */
function tsxAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve("tsx/esm/api");
    return true;
  } catch {
    return false;
  }
}

const TSX_AVAILABLE = tsxAvailable();

// The worker entry is a .mjs bootstrap (a sibling of src/, one level up from this
// module) that registers tsx then imports the real .ts worker. Node 20 cannot
// resolve a .ts worker entry directly even via `--import tsx`.
const BOOTSTRAP_URL = new URL("../worker-bootstrap.mjs", import.meta.url);

/**
 * Spawn a worker thread running the tsx bootstrap. Returns null on synchronous
 * failure; async failures surface via the worker 'error' event and are caught by
 * the caller's probe / inline fallback.
 */
function trySpawnWorker(): Worker | null {
  if (!TSX_AVAILABLE) return null;
  try {
    return new Worker(BOOTSTRAP_URL);
  } catch {
    return null;
  }
}

const PROBE_CONFIG: BattleConfig = {
  seed: 0, teamCount: 2, powers: ["Tank", "Swift"], totalCells: 40,
  arena: { width: 280, height: 498 }, maxTicks: 300,
};

/**
 * Verify a worker can actually start AND run a battle (i.e. the tsx bootstrap
 * imported worker.ts successfully). Resolves true only after a real result comes
 * back. Used to decide between the real pool and the inline fallback.
 */
function probeWorker(): Promise<boolean> {
  return new Promise((resolve) => {
    const w = trySpawnWorker();
    if (!w) { resolve(false); return; }
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      w.removeAllListeners();
      w.terminate().catch(() => {});
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), 8000);
    w.once("message", () => { clearTimeout(timer); done(true); });
    w.once("error", () => { clearTimeout(timer); done(false); });
    w.once("exit", (code) => { clearTimeout(timer); done(code === 0); });
    w.once("online", () => {
      w.postMessage({ config: PROBE_CONFIG } satisfies WorkerTask);
    });
  });
}

export async function runSweep(job: SweepJob): Promise<void> {
  const { spec, dbPath, batchId, profile } = job;
  const concurrency = Math.max(1, job.concurrency ?? 4);
  const topNlogs = job.topNlogs ?? 25;

  const store = new Store(dbPath);
  try {
    const all = expand(spec);
    const done = store.allConfigIds();
    const tasks: BattleConfig[] = all.filter((c) => !done.has(configId(c)));
    const total = tasks.length;

    if (total === 0) {
      job.onProgress?.(0, 0, bestScore(store, batchId));
      return;
    }

    const buffer: ResultRow[] = [];
    let completed = 0;
    let stopped = false;

    // Track the running top-N score threshold for selective log persistence.
    const flush = () => {
      if (buffer.length) {
        store.insertMany(buffer.splice(0, buffer.length));
      }
    };

    const handleResult = (r: WorkerResult) => {
      const row = resultRow(batchId, r);
      buffer.push(row);
      completed++;
      // Persist logs only for configs whose score is within the running top-N.
      const threshold = topNScoreThreshold(store, batchId, topNlogs, buffer);
      if (r.report.score >= threshold) {
        store.saveLog(row.configId, r.log);
      }
      if (buffer.length >= FLUSH_EVERY) flush();
      job.onProgress?.(completed, total, Math.max(threshold, bestScore(store, batchId)));
    };

    const runInline = () => {
      for (const config of tasks.slice(completed)) {
        if (job.stopFlag?.()) { stopped = true; break; }
        handleResult(runOne({ config, profile }));
      }
      flush();
    };

    // Try real worker threads; fall back to inline if they can't boot under tsx.
    const workersUsable = await probeWorker();
    if (!workersUsable) {
      runInline();
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let nextIndex = 0;
      let active = 0;
      const workers: Worker[] = [];

      const tryStop = () => {
        if (!stopped && job.stopFlag?.()) stopped = true;
        return stopped;
      };

      const finishWorker = (w: Worker) => {
        w.postMessage({ done: true });
        active--;
        if (active === 0) {
          flush();
          for (const ww of workers) ww.terminate().catch(() => {});
          resolve();
        }
      };

      const assign = (w: Worker) => {
        if (tryStop() || nextIndex >= tasks.length) {
          finishWorker(w);
          return;
        }
        const config = tasks[nextIndex++]!;
        const task: WorkerTask = { config, profile };
        w.postMessage(task);
      };

      for (let i = 0; i < concurrency && i < tasks.length; i++) {
        const w = trySpawnWorker();
        if (!w) { reject(new Error("worker spawn failed mid-pool")); return; }
        active++;
        workers.push(w);
        w.on("message", (r: WorkerResult) => {
          handleResult(r);
          assign(w);
        });
        w.on("error", (err) => reject(err));
        assign(w);
      }
    });
  } finally {
    store.close();
  }
}

function bestScore(store: Store, batchId: string): number {
  const top = store.topN(1, batchId);
  return top[0]?.score ?? 0;
}

/**
 * Compute the score threshold for the top-N logs: the Nth-highest score across
 * both already-stored rows for this batch and the in-flight buffer. Below this,
 * a log need not be persisted.
 */
function topNScoreThreshold(
  store: Store,
  batchId: string,
  n: number,
  buffer: ResultRow[],
): number {
  const stored = store.topN(n, batchId).map((r) => r.score);
  const pending = buffer.map((r) => r.score);
  const scores = [...stored, ...pending].sort((a, b) => b - a);
  if (scores.length < n) return -Infinity; // top-N not yet full: keep everything
  return scores[n - 1]!;
}
