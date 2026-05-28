// Typed fetch wrappers over the bridge server (apps/harness/src/server.ts). The base is "" so all
// requests are same-origin /api/* — in dev Vite proxies them to the bridge port; in prod the
// bridge serves both the assets and the API. URL builders are PURE and unit-tested (see
// test/api.test.ts) so query encoding can't silently regress.

import type { BattleConfig, BattleLog } from "@cellstorm/sim";
import type { ResultRow, SweepSpec } from "@cellstorm/cli";
import type { ScoreProfile } from "@cellstorm/score";

export interface SweepProgress {
  done: number;
  total: number;
  best: number;
  running: boolean;
}

export interface StartSweepBody {
  spec: SweepSpec;
  batchId?: string;
  concurrency?: number;
  topNlogs?: number;
  profile?: ScoreProfile;
}

// --- pure URL builders (unit-tested) --------------------------------------
export function resultsUrl(n: number, batch?: string): string {
  const params = new URLSearchParams({ n: String(n) });
  if (batch) params.set("batch", batch);
  return `/api/results?${params.toString()}`;
}
export function configUrl(id: string): string {
  return `/api/config/${encodeURIComponent(id)}`;
}
export function logUrl(id: string): string {
  return `/api/log/${encodeURIComponent(id)}`;
}
export function progressUrl(batchId: string): string {
  return `/api/sweep/${encodeURIComponent(batchId)}/progress`;
}
export function stopUrl(batchId: string): string {
  return `/api/sweep/${encodeURIComponent(batchId)}/stop`;
}

// --- fetch wrappers --------------------------------------------------------
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

export function fetchResults(n: number, batch?: string): Promise<ResultRow[]> {
  return getJson<ResultRow[]>(resultsUrl(n, batch));
}
export function fetchConfig(id: string): Promise<BattleConfig> {
  return getJson<BattleConfig>(configUrl(id));
}
export function fetchLog(id: string): Promise<BattleLog> {
  return getJson<BattleLog>(logUrl(id));
}
export function fetchPowers(): Promise<string[]> {
  return getJson<string[]>("/api/powers");
}
export function fetchDbPath(): Promise<{ dbPath: string }> {
  return getJson<{ dbPath: string }>("/api/dbpath");
}
export function fetchProgress(batchId: string): Promise<SweepProgress> {
  return getJson<SweepProgress>(progressUrl(batchId));
}

export async function startSweep(body: StartSweepBody): Promise<{ batchId: string }> {
  const res = await fetch("/api/sweep", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /api/sweep -> ${res.status}`);
  return (await res.json()) as { batchId: string };
}

export async function stopSweep(batchId: string): Promise<void> {
  const res = await fetch(stopUrl(batchId), { method: "POST" });
  if (!res.ok) throw new Error(`POST ${stopUrl(batchId)} -> ${res.status}`);
}
