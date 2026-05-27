import { parentPort } from "node:worker_threads";
import { runBattle, type BattleConfig } from "@cellstorm/sim";
import { score, DEFAULT_PROFILE, type ScoreProfile } from "@cellstorm/score";

export interface WorkerTask {
  config: BattleConfig;
  profile?: ScoreProfile;
}

export interface WorkerResult {
  config: BattleConfig;
  summary: ReturnType<typeof runBattle>["summary"];
  report: ReturnType<typeof score>;
  log: ReturnType<typeof runBattle>["log"];
}

/** Run a single battle + score it. Shared by the worker thread and the inline fallback. */
export function runOne(task: WorkerTask): WorkerResult {
  const profile = task.profile ?? DEFAULT_PROFILE;
  const { log, summary } = runBattle(task.config);
  const report = score(log, profile);
  return { config: task.config, summary, report, log };
}

if (parentPort) {
  const port = parentPort;
  port.on("message", (msg: WorkerTask | { done: true }) => {
    if ("done" in msg && msg.done) {
      port.close();
      return;
    }
    const result = runOne(msg as WorkerTask);
    port.postMessage(result);
  });
}
