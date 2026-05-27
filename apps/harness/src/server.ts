// Bridge server: a tiny node:http server that exposes the SQLite Store + sweep control to the
// browser harness over JSON. In dev, Vite proxies /api here; in prod this server also serves the
// built Vite assets. A harness-launched sweep runs as a detached CHILD PROCESS (sweepChild.ts via
// tsx) so the HTTP request returns immediately with the batchId and the sweep survives on its own.
//
// DB path is configurable: env CELLSTORM_DB or --db, default ./data/cellstorm.db. The data/ dir is
// created if missing. Port: env PORT or --port, default 5174.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  createReadStream,
} from "node:fs";
import { dirname, join, resolve, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { Store, type SweepSpec } from "@cellstorm/cli";
import { runBattle, POWER_NAMES, normalizeConfig, type BattleConfig } from "@cellstorm/sim";
import type { ScoreProfile } from "@cellstorm/score";

const __dirname = dirname(fileURLToPath(import.meta.url));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const DB_PATH = resolve(arg("db") ?? process.env.CELLSTORM_DB ?? "./data/cellstorm.db");
const PORT = Number(arg("port") ?? process.env.PORT ?? 5174);
const DIST_DIR = resolve(__dirname, "..", "dist");

mkdirSync(dirname(DB_PATH), { recursive: true });

// --- sweep control state ---------------------------------------------------
// One stop file per batch (matches the CLI stop semantics: ${db}.stop is polled by runSweep).
// We use a per-batch stop file so stopping one batch doesn't stop another.
function stopFilePath(batchId: string): string {
  return `${DB_PATH}.${batchId}.stop`;
}
function progressFilePath(batchId: string): string {
  return `${DB_PATH}.${batchId}.progress.json`;
}

interface ProgressFile {
  done: number;
  total: number;
  best: number;
  running: boolean;
}

function readProgress(batchId: string): ProgressFile {
  try {
    return JSON.parse(readFileSync(progressFilePath(batchId), "utf8")) as ProgressFile;
  } catch {
    return { done: 0, total: 0, best: 0, running: false };
  }
}

// --- request helpers -------------------------------------------------------
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(json);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function serveStatic(req: IncomingMessage, res: ServerResponse, urlPath: string): void {
  if (!existsSync(DIST_DIR)) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("No built assets. Run `pnpm --filter @cellstorm/harness build`, or use `vite` in dev.");
    return;
  }
  // Resolve within DIST_DIR, defaulting to index.html (SPA fallback).
  let rel = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  if (rel === "/" || rel === "") rel = "/index.html";
  const full = normalize(join(DIST_DIR, rel));
  const target = full.startsWith(DIST_DIR) && existsSync(full) ? full : join(DIST_DIR, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(target)] ?? "application/octet-stream" });
  createReadStream(target).pipe(res);
}

// --- API -------------------------------------------------------------------
async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const path = url.pathname;
  const method = req.method ?? "GET";

  // GET /api/results?n=&batch=
  if (method === "GET" && path === "/api/results") {
    const n = Number(url.searchParams.get("n") ?? 50);
    const batch = url.searchParams.get("batch") ?? undefined;
    const store = new Store(DB_PATH);
    try {
      sendJson(res, 200, store.topN(n, batch));
    } finally {
      store.close();
    }
    return true;
  }

  // GET /api/powers
  if (method === "GET" && path === "/api/powers") {
    sendJson(res, 200, POWER_NAMES);
    return true;
  }

  // GET /api/config/:id
  const cfgMatch = /^\/api\/config\/(.+)$/.exec(path);
  if (method === "GET" && cfgMatch) {
    const id = decodeURIComponent(cfgMatch[1]!);
    const store = new Store(DB_PATH);
    try {
      const cfg = store.getConfig(id);
      if (!cfg) {
        sendJson(res, 404, { error: "config not found", id });
      } else {
        sendJson(res, 200, cfg);
      }
    } finally {
      store.close();
    }
    return true;
  }

  // GET /api/log/:id  — cached log, else re-derive deterministically from config.
  const logMatch = /^\/api\/log\/(.+)$/.exec(path);
  if (method === "GET" && logMatch) {
    const id = decodeURIComponent(logMatch[1]!);
    const store = new Store(DB_PATH);
    try {
      const cached = store.getLog(id);
      if (cached) {
        sendJson(res, 200, cached);
        return true;
      }
      const cfg = store.getConfig(id);
      if (!cfg) {
        sendJson(res, 404, { error: "config not found", id });
        return true;
      }
      // Deterministic re-derivation: same seed+config -> identical log.
      const { log } = runBattle(cfg);
      sendJson(res, 200, log);
    } finally {
      store.close();
    }
    return true;
  }

  // POST /api/sweep  — body: { spec, batchId?, concurrency?, topNlogs?, profile? }
  if (method === "POST" && path === "/api/sweep") {
    const raw = await readBody(req);
    let body: {
      spec: SweepSpec;
      batchId?: string;
      concurrency?: number;
      topNlogs?: number;
      profile?: ScoreProfile;
    };
    try {
      body = JSON.parse(raw);
    } catch {
      sendJson(res, 400, { error: "invalid JSON body" });
      return true;
    }
    if (!body.spec) {
      sendJson(res, 400, { error: "missing spec" });
      return true;
    }
    const batchId = body.batchId && body.batchId.trim() ? body.batchId.trim() : `batch-${Date.now()}`;
    startSweepChild({ ...body, batchId });
    sendJson(res, 202, { batchId });
    return true;
  }

  // GET /api/sweep/:batch/progress
  const progMatch = /^\/api\/sweep\/([^/]+)\/progress$/.exec(path);
  if (method === "GET" && progMatch) {
    const batchId = decodeURIComponent(progMatch[1]!);
    sendJson(res, 200, readProgress(batchId));
    return true;
  }

  // POST /api/sweep/:batch/stop  — trip the stop file the child's stopFlag polls.
  const stopMatch = /^\/api\/sweep\/([^/]+)\/stop$/.exec(path);
  if (method === "POST" && stopMatch) {
    const batchId = decodeURIComponent(stopMatch[1]!);
    writeFileSync(stopFilePath(batchId), String(Date.now()));
    sendJson(res, 200, { stopped: batchId });
    return true;
  }

  return false; // not an API route
}

// Validate the incoming spec by expanding-normalizing the first config (fail fast on bad powers).
function validateSpecFixed(spec: SweepSpec): void {
  if (spec.powers.mode === "fixed") {
    const tc = Array.isArray(spec.teamCount) ? spec.teamCount[0]! : spec.teamCount;
    const cfg: BattleConfig = normalizeConfig({
      seed: 0,
      teamCount: tc,
      powers: spec.powers.names,
      totalCells: spec.totalCells,
    });
    void cfg;
  }
}

function startSweepChild(job: {
  spec: SweepSpec;
  batchId: string;
  concurrency?: number;
  topNlogs?: number;
  profile?: ScoreProfile;
}): void {
  validateSpecFixed(job.spec);
  const stopPath = stopFilePath(job.batchId);
  const progressPath = progressFilePath(job.batchId);
  // Clear any stale stop flag from a prior run of this batch id.
  if (existsSync(stopPath)) rmSync(stopPath);

  const childJobPath = join(tmpdir(), `cellstorm-sweep-${job.batchId}-${Date.now()}.json`);
  writeFileSync(
    childJobPath,
    JSON.stringify({ ...job, dbPath: DB_PATH, progressPath, stopPath }),
  );

  const childEntry = resolve(__dirname, "sweepChild.ts");
  // Spawn detached via tsx so the sweep survives independently of this request/connection.
  const child = spawn("tsx", [childEntry, childJobPath], {
    cwd: resolve(__dirname, ".."),
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.on("error", (err) => {
    process.stderr.write(`failed to spawn sweep child: ${err.message}\n`);
  });
  child.unref();
}

// --- server ----------------------------------------------------------------
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).then((handled) => {
      if (!handled) sendJson(res, 404, { error: "unknown api route", path: url.pathname });
    }).catch((err) => {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    });
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  process.stdout.write(`cellstorm bridge listening on http://localhost:${PORT} (db: ${DB_PATH})\n`);
});
