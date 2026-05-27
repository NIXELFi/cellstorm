import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { runSweep } from "../src/runner";
import { Store } from "../src/store";

const DB = "/tmp/cellstorm-runner.db";
afterEach(() => { try { rmSync(DB); } catch {} try { rmSync(DB + "-logs", { recursive: true }); } catch {} });

describe("runSweep", () => {
  it("scores a small sweep and stores results", async () => {
    await runSweep({
      spec: { teamCount: 2, powers: { mode: "random" }, seeds: { from: 0, to: 7 } },
      dbPath: DB, batchId: "t1", concurrency: 2, topNlogs: 4,
    });
    const s = new Store(DB);
    expect(s.count()).toBe(8);
    s.close();
  }, 30000);

  it("resumes by skipping already-stored configs", async () => {
    const job = {
      spec: { teamCount: 2, powers: { mode: "random" as const }, seeds: { from: 0, to: 3 } },
      dbPath: DB, batchId: "t2", concurrency: 2, topNlogs: 2,
    };
    await runSweep(job);
    const s = new Store(DB);
    const firstCount = s.count();
    s.close();
    // Re-run: nothing new should be added (all configIds already present).
    await runSweep(job);
    const s2 = new Store(DB);
    expect(s2.count()).toBe(firstCount);
    s2.close();
  }, 30000);

  it("bounds the cached logs to ~topNlogs after a sweep", async () => {
    await runSweep({
      spec: { teamCount: 2, powers: { mode: "random" }, seeds: { from: 0, to: 19 } },
      dbPath: DB, batchId: "t3", concurrency: 2, topNlogs: 3,
    });
    const s = new Store(DB);
    expect(s.count()).toBe(20);
    const cached = s.cachedLogIds();
    // Cache pruned to the final top-N; never exceeds topNlogs.
    expect(cached.length).toBeLessThanOrEqual(3);
    // Every cached log must correspond to a real stored row (no orphans).
    const stored = s.allConfigIds();
    for (const id of cached) expect(stored.has(id)).toBe(true);
    // The top-scoring config's log must be retained.
    const best = s.topN(1, "t3")[0]!;
    expect(s.getLog(best.configId)).not.toBeNull();
    s.close();
  }, 30000);

  it("invokes onProgress with the true running max best score", async () => {
    let lastBest = -Infinity;
    let monotonic = true;
    await runSweep({
      spec: { teamCount: 2, powers: { mode: "random" }, seeds: { from: 0, to: 9 } },
      dbPath: DB, batchId: "t4", concurrency: 2, topNlogs: 2,
      onProgress: (_d, _t, best) => {
        if (best < lastBest) monotonic = false;
        lastBest = best;
      },
    });
    // Running max never decreases across progress callbacks.
    expect(monotonic).toBe(true);
    const s = new Store(DB);
    expect(lastBest).toBe(s.topN(1, "t4")[0]!.score);
    s.close();
  }, 30000);
});
