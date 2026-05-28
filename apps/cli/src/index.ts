// Library surface of @cellstorm/cli — importable by the harness bridge server WITHOUT
// triggering the CLI's main() (which lives in cli.ts and runs on import). Keep this the
// only entry other apps import from.

export { runSweep, runPool, TopNScores } from "./runner";
export type { SweepJob, PoolWorker } from "./runner";
export { Store, configId, configIdOf } from "./store";
export type { ResultRow } from "./store";
export { expand } from "./sweepSpec";
export type { SweepSpec, PowerAssignment } from "./sweepSpec";
export { runOne } from "./worker";
export type { WorkerTask, WorkerResult } from "./worker";
