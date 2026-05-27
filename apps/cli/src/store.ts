import Database from "better-sqlite3";
import { gzipSync, gunzipSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { BattleConfig, BattleLog } from "@cellstorm/sim";

export interface ResultRow {
  configId: string;
  config: BattleConfig;
  score: number;
  breakdown: Record<string, number>;
  winner: number;
  durationTicks: number;
  batchId: string;
}

interface RawRow {
  configId: string;
  config: string;
  score: number;
  breakdown: string;
  winner: number;
  durationTicks: number;
  batchId: string;
}

/** Stable configId for a battle config. */
export function configId(c: BattleConfig): string {
  return `${c.teamCount}:${c.powers.join(",")}:${c.seed}`;
}

export class Store {
  private db: Database.Database;
  private logsDir: string;

  constructor(private dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS results (
        configId TEXT PRIMARY KEY,
        config TEXT,
        score REAL,
        breakdown TEXT,
        winner INTEGER,
        durationTicks INTEGER,
        batchId TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_results_score ON results (score DESC);
    `);
    this.logsDir = `${dbPath}-logs`;
  }

  private toRaw(r: ResultRow): RawRow {
    return {
      configId: r.configId,
      config: JSON.stringify(r.config),
      score: r.score,
      breakdown: JSON.stringify(r.breakdown),
      winner: r.winner,
      durationTicks: r.durationTicks,
      batchId: r.batchId,
    };
  }

  private fromRaw(r: RawRow): ResultRow {
    return {
      configId: r.configId,
      config: JSON.parse(r.config) as BattleConfig,
      score: r.score,
      breakdown: JSON.parse(r.breakdown) as Record<string, number>,
      winner: r.winner,
      durationTicks: r.durationTicks,
      batchId: r.batchId,
    };
  }

  insert(row: ResultRow): void {
    this.insertStmt().run(this.toRaw(row));
  }

  private _insertStmt?: Database.Statement;
  private insertStmt(): Database.Statement {
    if (!this._insertStmt) {
      // INSERT OR REPLACE: a re-run of the same configId (same teamCount:powers:seed)
      // overwrites the prior row. This is the intended cross-batch overwrite semantic —
      // resume is idempotent and a config is only ever stored once. The latest batch wins.
      this._insertStmt = this.db.prepare(
        `INSERT OR REPLACE INTO results
         (configId, config, score, breakdown, winner, durationTicks, batchId)
         VALUES (@configId, @config, @score, @breakdown, @winner, @durationTicks, @batchId)`,
      );
    }
    return this._insertStmt;
  }

  insertMany(rows: ResultRow[]): void {
    const stmt = this.insertStmt();
    const tx = this.db.transaction((rs: ResultRow[]) => {
      for (const r of rs) stmt.run(this.toRaw(r));
    });
    tx(rows);
  }

  topN(n: number, batchId?: string): ResultRow[] {
    const sql = batchId
      ? `SELECT * FROM results WHERE batchId = ? ORDER BY score DESC LIMIT ?`
      : `SELECT * FROM results ORDER BY score DESC LIMIT ?`;
    const args = batchId ? [batchId, n] : [n];
    const raws = this.db.prepare(sql).all(...args) as RawRow[];
    return raws.map((r) => this.fromRaw(r));
  }

  count(): number {
    const r = this.db.prepare(`SELECT COUNT(*) AS c FROM results`).get() as { c: number };
    return r.c;
  }

  has(configId: string): boolean {
    const r = this.db.prepare(`SELECT 1 FROM results WHERE configId = ?`).get(configId);
    return r !== undefined;
  }

  /** All configIds currently stored (for resume filtering). */
  allConfigIds(): Set<string> {
    const rows = this.db.prepare(`SELECT configId FROM results`).all() as { configId: string }[];
    return new Set(rows.map((r) => r.configId));
  }

  getConfig(id: string): BattleConfig | null {
    const r = this.db.prepare(`SELECT config FROM results WHERE configId = ?`).get(id) as
      | { config: string }
      | undefined;
    return r ? (JSON.parse(r.config) as BattleConfig) : null;
  }

  saveLog(id: string, log: BattleLog): void {
    if (!existsSync(this.logsDir)) mkdirSync(this.logsDir, { recursive: true });
    const gz = gzipSync(Buffer.from(JSON.stringify(log), "utf8"));
    writeFileSync(join(this.logsDir, `${id}.json.gz`), gz);
  }

  getLog(id: string): BattleLog | null {
    const path = join(this.logsDir, `${id}.json.gz`);
    if (!existsSync(path)) return null;
    const gz = readFileSync(path);
    return JSON.parse(gunzipSync(gz).toString("utf8")) as BattleLog;
  }

  /** Delete a cached log if present (used to prune below the final top-N threshold). */
  deleteLog(id: string): void {
    const path = join(this.logsDir, `${id}.json.gz`);
    if (existsSync(path)) rmSync(path);
  }

  /** All configIds that currently have a cached `.json.gz` log on disk. */
  cachedLogIds(): string[] {
    if (!existsSync(this.logsDir)) return [];
    return readdirSync(this.logsDir)
      .filter((f) => f.endsWith(".json.gz"))
      .map((f) => f.slice(0, -".json.gz".length));
  }

  close(): void {
    // Fold the WAL back into the main db and drop the -wal/-shm sidecars so they
    // don't persist or grow when another process (e.g. the harness) opens the db.
    try {
      this.db.pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      // best-effort; a failed checkpoint must not block close
    }
    this.db.close();
  }
}
