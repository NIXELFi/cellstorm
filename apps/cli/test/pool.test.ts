import { describe, it, expect } from "vitest";
import { runPool, type PoolWorker } from "../src/runner";
import type { WorkerResult, WorkerTask } from "../src/worker";

// A fake in-process worker we can drive deterministically. By default it answers
// every task with a synthetic result on the next microtask. Modes let us simulate
// a worker that dies (clean exit / error+exit) instead of replying.
type Mode = "ok" | "exit-clean" | "error-then-exit" | "exit-nonzero";

function fakeWorker(mode: Mode): PoolWorker {
  const handlers: Record<string, ((arg: any) => void)[]> = { message: [], error: [], exit: [] };
  let dead = false;
  const emit = (ev: string, arg?: any) => {
    if (ev === "exit") dead = true;
    for (const h of handlers[ev] ?? []) h(arg);
  };
  return {
    postMessage(msg: unknown) {
      if (dead) return;
      const m = msg as WorkerTask | { done: true };
      if ((m as { done?: true }).done) return; // teardown ping
      const task = m as WorkerTask;
      queueMicrotask(() => {
        if (mode === "ok") {
          emit("message", {
            config: task.config,
            summary: { winner: 0, durationTicks: 1 },
            report: { score: task.config.seed, breakdown: {} },
            log: {},
          } as unknown as WorkerResult);
        } else if (mode === "exit-clean") {
          emit("exit", 0); // dies mid-task WITHOUT error or message — the hang case
        } else if (mode === "exit-nonzero") {
          emit("exit", 1);
        } else if (mode === "error-then-exit") {
          emit("error", new Error("boom"));
          emit("exit", 1);
        }
      });
    },
    on(ev: string, cb: (arg: any) => void) { handlers[ev]!.push(cb); },
    removeAllListeners() { handlers.message = []; handlers.error = []; handlers.exit = []; },
    terminate() { dead = true; },
  };
}

function tasks(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    seed: i, teamCount: 2, powers: ["Tank", "Swift"], totalCells: 40,
    arena: { width: 100, height: 100 }, maxTicks: 10,
  })) as any[];
}

const noStop = () => false;

describe("runPool resilience", () => {
  it("settles and runs every task with healthy workers", async () => {
    const seen: number[] = [];
    await runPool({
      tasks: tasks(20), concurrency: 4, isStopped: noStop,
      handleResult: (r) => { seen.push(r.config.seed); },
      spawn: () => fakeWorker("ok"),
    });
    expect(seen.sort((a, b) => a - b)).toEqual([...Array(20).keys()]);
  });

  it("does NOT hang when a worker exits cleanly mid-task; reassigns the task", async () => {
    // First spawn dies on its first task (clean exit, no error). Every later spawn
    // is healthy. The reassigned task must still be completed.
    let n = 0;
    const seen = new Set<number>();
    await runPool({
      tasks: tasks(8), concurrency: 2, isStopped: noStop,
      handleResult: (r) => { seen.add(r.config.seed); },
      spawn: () => fakeWorker(n++ === 0 ? "exit-clean" : "ok"),
    });
    // No hang (we got here) and all 8 tasks completed despite the early death.
    expect(seen.size).toBe(8);
  });

  it("survives a worker that emits error then exits; reassigns its task", async () => {
    let n = 0;
    const seen = new Set<number>();
    await runPool({
      tasks: tasks(8), concurrency: 2, isStopped: noStop,
      handleResult: (r) => { seen.add(r.config.seed); },
      spawn: () => fakeWorker(n++ === 0 ? "error-then-exit" : "ok"),
    });
    expect(seen.size).toBe(8);
  });

  it("never hangs even if EVERY worker dies (falls back to inline)", async () => {
    const seen = new Set<number>();
    await runPool({
      tasks: tasks(5), concurrency: 3, isStopped: noStop,
      handleResult: (r) => { seen.add(r.config.seed); },
      // No worker can ever spawn.
      spawn: () => null,
      inline: (t) => ({
        config: t.config,
        summary: { winner: 0, durationTicks: 1 },
        report: { score: t.config.seed, breakdown: {} },
        log: {},
      } as unknown as WorkerResult),
    });
    expect(seen.size).toBe(5);
  });

  it("settles promptly on stop without dispatching remaining tasks", async () => {
    let count = 0;
    const seen: number[] = [];
    await runPool({
      tasks: tasks(100), concurrency: 2,
      isStopped: () => count >= 4, // stop after a few results
      handleResult: (r) => { seen.push(r.config.seed); count++; },
      spawn: () => fakeWorker("ok"),
    });
    // Stopped early: far fewer than 100 dispatched, and no hang.
    expect(seen.length).toBeLessThan(100);
    expect(seen.length).toBeGreaterThanOrEqual(4);
  });
});
