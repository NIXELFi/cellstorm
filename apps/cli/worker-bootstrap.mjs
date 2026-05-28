// Worker thread bootstrap. Node 20 + worker_threads cannot resolve a .ts entry
// directly even with `--import tsx` (the loader registers too late for the
// worker's own entry module). Instead the pool points workers at this .mjs file,
// which registers the tsx ESM loader synchronously and then imports the real
// TypeScript worker. See runner.ts trySpawnWorker().
import { register } from "tsx/esm/api";
register();
await import("./src/worker.ts");
