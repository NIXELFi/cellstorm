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
});
