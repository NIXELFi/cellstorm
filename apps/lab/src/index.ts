// Public surface of @cellstorm/lab — the dev experimentation workbench.

export { roundRobin, LAB_TOTAL_CELLS } from "./roundRobin";
export type { RoundRobinResult } from "./roundRobin";

export { balanceReport } from "./balance";
export type { PowerStat, BalanceOptions } from "./balance";

export { snapshot, configId, DEFAULT_SNAPSHOT_CONFIGS } from "./snapshot";
export type { SnapshotEntry } from "./snapshot";

export { scoreDiff } from "./scoreDiff";
export type { ScoreDiffRow } from "./scoreDiff";
