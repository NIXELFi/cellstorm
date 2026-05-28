import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import type { BattleConfig } from "@cellstorm/sim";
import type { BattleLog } from "@cellstorm/sim";
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
 * Bounded ascending min-list of the top-N scores seen so far. Lets us compute the
 * "is this score worth keeping a log for" threshold in O(N) per insert without any
 * DB round-trip. N is small (topNlogs, default 25) so a sorted array beats a heap
 * for clarity. min() is the threshold a new score must meet/exceed once full.
 */
export class TopNScores {
  private readonly arr: number[] = []; // ascending
  constructor(private readonly n: number) {}

  /** Offer a score; keeps at most n highest. */
  add(score: number): void {
    if (this.n <= 0) return;
    if (this.arr.length < this.n) {
      this.insertSorted(score);
      return;
    }
    if (score > this.arr[0]!) {
      this.arr.shift();
      this.insertSorted(score);
    }
  }

  private insertSorted(score: number): void {
    let lo = 0;
    let hi = this.arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.arr[mid]! < score) lo = mid + 1;
      else hi = mid;
    }
    this.arr.splice(lo, 0, score);
  }

  /** The score a log must meet/exceed to be worth persisting. */
  threshold(): number {
    if (this.n <= 0) return Infinity; // keep no logs at all
    if (this.arr.length < this.n) return -Infinity; // not yet full: keep everything
    return this.arr[0]!;
  }
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

  const all = expand(spec);
  const done = store.allConfigIds();
  const tasks: BattleConfig[] = all.filter((c) => !done.has(configId(c)));
  const total = tasks.length;

  // Buffered rows awaiting flush, and the logs we deferred for those rows. Logs are
  // written ONLY when their row is committed by insertMany — so a crash can never
  // leave a .gz on disk with no matching DB row.
  const buffer: ResultRow[] = [];
  const pendingLogs = new Map<string, BattleLog>();
  let completed = 0;
  let stopped = false;

  // In-memory running structures: the top-N score window (for the log-keep
  // threshold) and the true running max (for onProgress). No per-result DB query.
  const topScores = new TopNScores(topNlogs);
  let runningMax = bestScore(store, batchId);
  // Seed the top-N window from already-stored rows so resume keeps a correct threshold.
  for (const r of store.topN(topNlogs, batchId)) topScores.add(r.score);

  const flush = () => {
    if (buffer.length === 0) return;
    const rows = buffer.splice(0, buffer.length);
    store.insertMany(rows);
    // Only after the rows are committed do we persist their deferred logs.
    for (const row of rows) {
      const log = pendingLogs.get(row.configId);
      if (log) {
        store.saveLog(row.configId, log);
        pendingLogs.delete(row.configId);
      }
    }
  };

  const handleResult = (r: WorkerResult) => {
    const row = resultRow(batchId, r);
    buffer.push(row);
    completed++;
    if (r.report.score > runningMax) runningMax = r.report.score;
    // Decide log persistence against the running top-N threshold BEFORE adding this
    // score, so a config is judged against the others (not against itself).
    if (r.report.score >= topScores.threshold()) {
      pendingLogs.set(row.configId, r.log);
    }
    topScores.add(r.report.score);
    if (buffer.length >= FLUSH_EVERY) flush();
    job.onProgress?.(completed, total, runningMax);
  };

  /**
   * After the sweep settles, prune cached logs whose score is below the final
   * top-N threshold so the cache stays bounded to ~topNlogs as promised. Keeps the
   * union of (logs we just decided to keep) and the actual stored top-N rows.
   */
  const pruneLogs = () => {
    if (topNlogs <= 0) return;
    const keep = new Set(store.topN(topNlogs, batchId).map((r) => r.configId));
    for (const id of store.cachedLogIds()) {
      if (!keep.has(id)) store.deleteLog(id);
    }
  };

  try {
    if (total === 0) {
      job.onProgress?.(0, 0, runningMax);
      return;
    }

    const runInline = () => {
      for (const config of tasks.slice(completed)) {
        if (job.stopFlag?.()) { stopped = true; break; }
        handleResult(runOne({ config, profile }));
      }
    };

    // Try real worker threads; fall back to inline if they can't boot under tsx.
    const workersUsable = await probeWorker();
    if (!workersUsable) {
      runInline();
      return;
    }

    await runPool({ tasks, concurrency, profile, handleResult, isStopped: () => {
      if (!stopped && job.stopFlag?.()) stopped = true;
      return stopped;
    } });
  } finally {
    // ANY termination path (success, stop, error, unexpected worker exit) must flush
    // the buffer (so up to FLUSH_EVERY-1 computed results aren't lost) and only then
    // close the store. Worker teardown is handled inside runPool's own finally.
    try {
      flush();
      pruneLogs();
    } finally {
      store.close();
    }
  }
}

/**
 * Minimal worker surface the pool relies on. `node:worker_threads`' Worker
 * satisfies it; tests provide a fake to simulate death/error/exit deterministically.
 */
export interface PoolWorker {
  postMessage(value: unknown): void;
  on(event: "message", cb: (r: WorkerResult) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "exit", cb: (code: number) => void): void;
  removeAllListeners(): void;
  terminate(): Promise<number> | void;
}

interface PoolArgs {
  tasks: BattleConfig[];
  concurrency: number;
  profile?: ScoreProfile;
  handleResult: (r: WorkerResult) => void;
  isStopped: () => boolean;
  /** Spawn factory (injectable for tests). Returns null if no worker can be spawned. */
  spawn?: () => PoolWorker | null;
  /** Inline runner used when no worker can be spawned (injectable for tests). */
  inline?: (task: WorkerTask) => WorkerResult;
}

/**
 * Worker-pool driver hardened for unattended multi-hour runs. Guarantees:
 *  - The returned promise ALWAYS settles — no hang — regardless of how a worker dies
 *    (clean exit, error, OOM, native abort).
 *  - A worker that dies with an in-flight task has that task REASSIGNED to a healthy /
 *    freshly-spawned worker, so a single crash never aborts the sweep.
 *  - On any exit path, all live workers are terminated (no thread leak).
 *
 * Per-battle errors are logged (the config is reproducible from its seed) and the
 * sweep continues — one bad config never kills the run.
 */
export function runPool(args: PoolArgs): Promise<void> {
  const { tasks, concurrency, profile, handleResult, isStopped } = args;
  const spawn = args.spawn ?? trySpawnWorker;
  const inline = args.inline ?? runOne;

  return new Promise<void>((resolve) => {
    let nextIndex = 0;
    let settled = false;
    // configIds (by task index) currently assigned to each worker, so we know what
    // to reassign if it dies mid-task.
    const inFlight = new Map<PoolWorker, number>();
    const workers = new Set<PoolWorker>();
    // Indices whose worker died and which need re-running (drained before nextIndex).
    const requeue: number[] = [];

    const allTasksDispatched = () =>
      nextIndex >= tasks.length && requeue.length === 0;

    const settle = () => {
      if (settled) return;
      settled = true;
      for (const w of workers) {
        w.removeAllListeners();
        void Promise.resolve(w.terminate()).catch(() => {});
      }
      workers.clear();
      inFlight.clear();
      resolve();
    };

    // Last-resort: drain any remaining (or requeued) work inline, then settle. Used
    // when the pool has zero live workers and cannot spawn more — the no-hang
    // backstop. Determinism-equivalent to the worker path: same `runOne`/inline.
    const drainInlineAndSettle = () => {
      if (settled) return;
      let idx: number | null;
      while ((idx = nextTaskIndex()) !== null) {
        try {
          handleResult(inline({ config: tasks[idx]!, profile }));
        } catch (err) {
          process.stderr.write(
            `\n[sweep] inline fallback error (config seed=${tasks[idx]!.seed}): ${
              err instanceof Error ? err.message : String(err)
            }\n`,
          );
        }
      }
      settle();
    };

    const maybeFinish = () => {
      // Done when every task has been dispatched and no worker is still busy, or when
      // we've been asked to stop and nothing is in flight.
      if (workers.size === 0) {
        // No workers left. If work remains and we're not stopping, finish it inline so
        // a total worker wipeout still completes the sweep instead of silently dropping
        // tasks. Otherwise just settle.
        if (!isStopped() && !allTasksDispatched()) drainInlineAndSettle();
        else settle();
        return;
      }
      if ((allTasksDispatched() || isStopped()) && inFlight.size === 0) {
        settle();
      }
    };

    const nextTaskIndex = (): number | null => {
      if (isStopped()) return null;
      if (requeue.length > 0) return requeue.shift()!;
      if (nextIndex < tasks.length) return nextIndex++;
      return null;
    };

    // Hand the worker its next task, or finalize it if there's no more work.
    const assign = (w: PoolWorker) => {
      if (settled || !workers.has(w)) return;
      const idx = nextTaskIndex();
      if (idx === null) {
        inFlight.delete(w);
        // No more work for this worker: ask it to close its port, then tear it down.
        try { w.postMessage({ done: true }); } catch { /* worker already gone */ }
        maybeFinish();
        return;
      }
      inFlight.set(w, idx);
      const task: WorkerTask = { config: tasks[idx]!, profile };
      try {
        w.postMessage(task);
      } catch {
        // Worker died between selection and post: requeue and let exit/respawn cover it.
        requeue.push(idx);
        inFlight.delete(w);
      }
    };

    // Respawn capacity if we still have undispatched work and lost a worker, so a
    // crash doesn't permanently shrink the pool below what the workload needs.
    const replenish = () => {
      if (settled) return;
      const remaining = (tasks.length - nextIndex) + requeue.length;
      while (
        !isStopped() &&
        workers.size < concurrency &&
        workers.size < remaining + inFlight.size &&
        remaining > 0
      ) {
        const w = spawnPoolWorker();
        if (!w) break; // can't spawn; rely on surviving workers (or settle if none)
        assign(w);
      }
    };

    const spawnPoolWorker = (): PoolWorker | null => {
      const w = spawn();
      if (!w) return null;
      workers.add(w);
      w.on("message", (r: WorkerResult) => {
        // A real result clears this worker's in-flight task.
        inFlight.delete(w);
        try {
          handleResult(r);
        } catch (err) {
          // Scoring/storage hiccup for one config: log and move on, don't kill the sweep.
          process.stderr.write(
            `\n[sweep] result-handling error: ${err instanceof Error ? err.message : String(err)}\n`,
          );
        }
        assign(w);
      });
      w.on("error", (err) => {
        // Async worker failure (e.g. uncaught throw running a battle). Requeue its
        // in-flight task so a healthy worker reruns it; the 'exit' that follows tears
        // this worker down. One bad config does NOT abort the sweep.
        const idx = inFlight.get(w);
        process.stderr.write(
          `\n[sweep] worker error${idx !== undefined ? ` (config seed=${tasks[idx]!.seed})` : ""}: ${
            err instanceof Error ? err.message : String(err)
          }\n`,
        );
        if (idx !== undefined && !isStopped()) requeue.push(idx);
        inFlight.delete(w);
      });
      w.on("exit", (code) => {
        // The critical no-hang guarantee. A worker can die WITHOUT ever emitting
        // 'error' (premature clean exit, OOM kill, native abort). If it still owned a
        // task, requeue it; then drop the worker, top the pool back up, and re-check
        // for completion. Because every exit funnels through here, `active` can never
        // get stuck and the promise always eventually settles.
        const idx = inFlight.get(w);
        inFlight.delete(w);
        workers.delete(w);
        w.removeAllListeners();
        if (idx !== undefined && !isStopped()) {
          if (code !== 0) {
            process.stderr.write(
              `\n[sweep] worker exited code=${code} mid-task (config seed=${tasks[idx]!.seed}); reassigning\n`,
            );
          }
          // Requeue only if not already requeued by a preceding 'error' handler.
          if (!requeue.includes(idx)) requeue.push(idx);
        }
        replenish();
        maybeFinish();
      });
      return w;
    };

    // Spin up the initial pool, capped at the task count.
    const initial = Math.min(concurrency, tasks.length);
    for (let i = 0; i < initial; i++) {
      const w = spawnPoolWorker();
      if (!w) break; // spawn failed; fall through to whatever workers we got
      assign(w);
    }
    // If not a single worker could spawn, run inline-equivalent so we never hang.
    // (Determinism-equivalent to the worker path: same runOne, same order.)
    if (workers.size === 0) drainInlineAndSettle();
  });
}

function bestScore(store: Store, batchId: string): number {
  const top = store.topN(1, batchId);
  return top[0]?.score ?? 0;
}
