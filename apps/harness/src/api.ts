// Typed fetch wrappers over the bridge server (apps/harness/src/server.ts). The base is "" so all
// requests are same-origin /api/* — in dev Vite proxies them to the bridge port; in prod the
// bridge serves both the assets and the API. URL builders are PURE and unit-tested (see
// test/api.test.ts) so query encoding can't silently regress.

import { unpackFrames, type BattleConfig, type BattleLog, type DrawFrame } from "@cellstorm/sim";
import type { ResultRow, SweepSpec } from "@cellstorm/cli";
import type { ScoreProfile } from "@cellstorm/score";
import type { MusicSettings } from "@cellstorm/audio";
import type { RenderProgress } from "./renderProgress";

/** Music settings plus the bridge-side file path returned by uploadMusic. */
export type MusicRender = MusicSettings & { path: string };

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
/** Cached-only log fetch: resolves only if the bridge already has the log on disk; rejects (404)
 * otherwise WITHOUT re-deriving. The grid uses this so loading never blocks the bridge. */
export function fetchLogCached(id: string): Promise<BattleLog> {
  return getJson<BattleLog>(`${logUrl(id)}?cachedOnly=1`);
}
/** Fetch the authoritative Node simulation for a config: drawable frames (unpacked) + the battle
 *  log. The preview DRAWS these rather than re-simming, so it matches the headless render
 *  bit-for-bit. Posts the full config (not an id) so tuning is reflected. */
export async function fetchFrames(config: BattleConfig): Promise<{ frames: DrawFrame[]; log: BattleLog }> {
  const res = await fetch("/api/frames", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config }),
  });
  if (!res.ok) throw new Error(`POST /api/frames -> ${res.status}`);
  const { framesB64, log } = (await res.json()) as { framesB64: string; log: BattleLog };
  const bin = atob(framesB64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return { frames: unpackFrames(u8), log };
}

export function fetchPowers(): Promise<string[]> {
  return getJson<string[]>("/api/powers");
}
export function fetchDbPath(): Promise<{ dbPath: string }> {
  return getJson<{ dbPath: string }>("/api/dbpath");
}
export function fetchLatestBatch(): Promise<{ batchId: string | null }> {
  return getJson<{ batchId: string | null }>("/api/latest-batch");
}
// The bridge serializes a RenderProgress (frames, total, timing) so the UI can show a real bar + ETA.
export type RenderState = RenderProgress;
export async function startRender(
  config: BattleConfig,
  hud: unknown,
  scale?: number,
  music?: MusicRender,
): Promise<{ renderId: string; out: string }> {
  const res = await fetch("/api/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config, hud, scale, music }),
  });
  if (!res.ok) throw new Error(`POST /api/render -> ${res.status}`);
  return (await res.json()) as { renderId: string; out: string };
}

/** Upload a user music file to the bridge; returns the on-disk path the renderer will mux. */
export async function uploadMusic(file: File): Promise<{ path: string; bytes: number }> {
  const res = await fetch(`/api/music?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error(`POST /api/music -> ${res.status}`);
  return (await res.json()) as { path: string; bytes: number };
}
export function fetchRenderProgress(renderId: string): Promise<RenderState> {
  return getJson<RenderState>(`/api/render/${encodeURIComponent(renderId)}`);
}

export async function setVideoMade(configId: string, made: boolean): Promise<void> {
  const res = await fetch(`/api/results/${encodeURIComponent(configId)}/video-made`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ made }),
  });
  if (!res.ok) throw new Error(`POST video-made -> ${res.status}`);
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
