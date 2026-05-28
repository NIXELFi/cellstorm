// Cross-platform SQLite backend with automatic fallback. This is what lets the catalog (and thus
// the harness, sweeps, and renderer) run on Windows AND macOS from the same code.
//
//   macOS / any machine with a working native build  -> better-sqlite3 (native, the documented path)
//   Windows / no C++ toolchain                        -> Node's built-in node:sqlite (Node >= 22.5)
//
// Both are wrapped to the same tiny synchronous interface Store needs, so store.ts is backend-
// agnostic. Selection is by *capability*, not by OS name: we try to load native better-sqlite3 and
// fall back only if it isn't there. better-sqlite3 is a native addon with no prebuilt binary for
// every Node ABI (e.g. Node 24 on win32), so it would otherwise need Visual Studio C++ build tools
// to compile. node:sqlite is the same SQLite engine, ships with Node, and needs no compiler.

import { createRequire } from "node:module";
import type BetterSqlite3 from "better-sqlite3";

export interface SqliteStatement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  /** Wrap fn so its writes commit atomically (mirrors better-sqlite3's db.transaction). */
  transaction<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void;
  close(): void;
}

export type SqliteBackend = "better-sqlite3" | "node:sqlite";

let chosen: SqliteBackend | null = null;
/** Which backend the most recent openDatabase() used (diagnostics/logging). */
export function activeBackend(): SqliteBackend | null {
  return chosen;
}

const req = createRequire(import.meta.url);

// --- node:sqlite minimal shape (declared locally so we don't depend on @types/node carrying the
// experimental node:sqlite types across versions). ---
interface NodeStatement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  setAllowBareNamedParameters(enabled: boolean): void;
}
interface NodeDatabase {
  exec(sql: string): void;
  prepare(sql: string): NodeStatement;
  close(): void;
}
interface NodeDatabaseCtor {
  new (path: string): NodeDatabase;
}

// undefined = not probed yet; null = probed and unusable. Memoized so the probe runs once/process.
let betterCtor: typeof BetterSqlite3 | null | undefined;

function loadBetterSqlite3(): typeof BetterSqlite3 | null {
  if (betterCtor !== undefined) return betterCtor;
  try {
    const Better = req("better-sqlite3") as typeof BetterSqlite3;
    // require() succeeds even when the native .node binary is missing (e.g. unbuilt on Windows) —
    // the failure only surfaces on construction. Probe with an in-memory db so we detect that here
    // and fall back to node:sqlite, rather than throwing later on the first real Store open.
    new Better(":memory:").close();
    betterCtor = Better;
  } catch {
    betterCtor = null; // not installed, or the native binary is missing / failed to build
  }
  return betterCtor;
}

function loadNodeSqlite(): NodeDatabaseCtor {
  // Built in on Node >= 22.5; require throws on older runtimes.
  const mod = req("node:sqlite") as { DatabaseSync: NodeDatabaseCtor };
  return mod.DatabaseSync;
}

export function openDatabase(path: string): SqliteDatabase {
  const Better = loadBetterSqlite3();
  if (Better) {
    chosen = "better-sqlite3";
    return wrapBetter(new Better(path));
  }
  let DatabaseSync: NodeDatabaseCtor;
  try {
    DatabaseSync = loadNodeSqlite();
  } catch {
    throw new Error(
      "No SQLite backend available: better-sqlite3 failed to load (it needs a native build) and " +
        "node:sqlite is missing (it needs Node >= 22.5). Fix: upgrade Node to >= 22.5, or install a " +
        "C++ toolchain so better-sqlite3 can compile.",
    );
  }
  chosen = "node:sqlite";
  return wrapNode(new DatabaseSync(path));
}

function wrapBetter(db: BetterSqlite3.Database): SqliteDatabase {
  return {
    exec: (sql) => {
      db.exec(sql);
    },
    prepare: (sql) => db.prepare(sql) as unknown as SqliteStatement,
    transaction: <A extends unknown[]>(fn: (...args: A) => void) =>
      db.transaction(fn) as unknown as (...args: A) => void,
    close: () => {
      db.close();
    },
  };
}

function wrapNode(db: NodeDatabase): SqliteDatabase {
  return {
    exec: (sql) => {
      db.exec(sql);
    },
    prepare: (sql) => {
      const stmt = db.prepare(sql);
      // Let a bare { configId } object bind to @configId — better-sqlite3 allows bare keys; node:sqlite
      // requires this opt-in. Keeps Store's named-parameter inserts identical across backends.
      stmt.setAllowBareNamedParameters(true);
      return {
        run: (...params) => stmt.run(...params),
        get: (...params) => stmt.get(...params),
        all: (...params) => stmt.all(...params),
      };
    },
    transaction:
      <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A) => {
        db.exec("BEGIN");
        try {
          fn(...args);
          db.exec("COMMIT");
        } catch (err) {
          try {
            db.exec("ROLLBACK");
          } catch {
            /* ignore rollback failure; surface the original error */
          }
          throw err;
        }
      },
    close: () => {
      db.close();
    },
  };
}
