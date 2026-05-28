// Dev launcher: starts the bridge server (tsx) and Vite together as one foreground process.
//
// Why not `concurrently "pnpm server" "vite"`? Running tsx through concurrently's nested
// `sh -c` / `pnpm run` layer made the tsx server process exit immediately (code 0) before it
// ever bound its port, which then tripped concurrently's `-k` and killed Vite too. Spawning the
// local .bin executables directly (no extra shell, inherited stdio) behaves exactly like running
// `tsx src/server.ts` by hand, which stays alive. This launcher also tears both children down
// together on Ctrl-C or if either one dies.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const binExt = process.platform === "win32" ? ".cmd" : "";
// tsx and vite live in the workspace-hoisted .bin; fall back to the package-local .bin.
function bin(name) {
  const candidates = [
    join(here, "node_modules", ".bin", name + binExt),
    join(here, "..", "..", "node_modules", ".bin", name + binExt),
  ];
  return candidates.find((p) => existsSync(p)) ?? name;
}

const port = process.env.PORT ?? "5174";
const env = { ...process.env, PORT: port };

const children = [];
function start(label, command, args) {
  const child = spawn(command, args, { cwd: here, env, stdio: "inherit" });
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`\n[dev] ${label} exited (code ${code}, signal ${signal}) — shutting down.`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    if (!c.killed) c.kill("SIGTERM");
  }
  // Give children a moment to exit cleanly, then force exit.
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("server", bin("tsx"), ["src/server.ts"]);
start("vite", bin("vite"), []);
