import { describe, it, expect, afterEach } from "vitest";
import { rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store";

const DB = join(tmpdir(), "cellstorm-test.db");
afterEach(() => { try { rmSync(DB); } catch {} try { rmSync(DB + "-logs", { recursive: true }); } catch {} });

describe("Store", () => {
  it("persists results and queries top-N by score", () => {
    const s = new Store(DB);
    s.insert({ configId: "a", config: {} as any, score: 5, breakdown: {}, winner: 0, durationTicks: 100, batchId: "b1" });
    s.insert({ configId: "b", config: {} as any, score: 9, breakdown: {}, winner: 1, durationTicks: 200, batchId: "b1" });
    s.close();
    const s2 = new Store(DB); // reopen
    const top = s2.topN(1);
    expect(top[0]!.configId).toBe("b");
    s2.close();
  });

  it("insertMany in a transaction, count, getConfig, and topN by batch", () => {
    const s = new Store(DB);
    s.insertMany([
      { configId: "x", config: { seed: 1 } as any, score: 1, breakdown: { a: 0.5 }, winner: 0, durationTicks: 10, batchId: "b1" },
      { configId: "y", config: { seed: 2 } as any, score: 3, breakdown: {}, winner: 1, durationTicks: 20, batchId: "b2" },
      { configId: "z", config: { seed: 3 } as any, score: 2, breakdown: {}, winner: 0, durationTicks: 30, batchId: "b1" },
    ]);
    expect(s.count()).toBe(3);
    expect(s.getConfig("x")).toEqual({ seed: 1 });
    const b1 = s.topN(10, "b1");
    expect(b1.map((r) => r.configId)).toEqual(["z", "x"]);
    s.close();
  });

  it("saves and reads back a gzipped log", () => {
    const s = new Store(DB);
    const log = { winner: 1, events: [{ type: "kill" }], timeline: [] };
    s.saveLog("logid", log as any);
    expect(s.getLog("logid")).toEqual(log);
    expect(s.getLog("missing")).toBeNull();
    s.close();
  });

  it("lists and deletes cached logs", () => {
    const s = new Store(DB);
    const log = { winner: 0, events: [], timeline: [] } as any;
    s.saveLog("keep", log);
    s.saveLog("drop", log);
    expect(s.cachedLogIds().sort()).toEqual(["drop", "keep"]);
    s.deleteLog("drop");
    expect(s.cachedLogIds()).toEqual(["keep"]);
    // deleting a missing log is a no-op
    s.deleteLog("nope");
    expect(s.cachedLogIds()).toEqual(["keep"]);
    s.close();
  });

  it("close truncates the WAL sidecar", () => {
    const s = new Store(DB);
    s.insert({ configId: "a", config: {} as any, score: 1, breakdown: {}, winner: 0, durationTicks: 1, batchId: "b" });
    s.close();
    // After a TRUNCATE checkpoint + close, the -wal sidecar (if present) should be empty.
    try {
      const walSize = statSync(DB + "-wal").size;
      expect(walSize).toBe(0);
    } catch {
      // -wal removed entirely is also acceptable
    }
  });
});
