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
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// We run both children as `node <script>` rather than spawning the platform .bin shims. Node 24 on
// Windows refuses to spawn a .cmd/.bat without shell:true (and shell:true would mangle quoted args),
// so resolving the real JS entry and handing it to node is the portable path that works everywhere.
// `--import` needs a file:// URL (a bare Windows C:\ path is rejected by the ESM loader).
const tsxLoader = pathToFileURL(require.resolve("tsx")).href; // `node --import <it>` registers TS.

// Absolute path to a dependency's bin script (a plain .js/.mjs we run with node).
function binScript(pkg, binName) {
  const pkgJsonPath = require.resolve(`${pkg}/package.json`);
  const pj = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  const rel = typeof pj.bin === "string" ? pj.bin : pj.bin[binName];
  return join(dirname(pkgJsonPath), rel);
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

start("server", process.execPath, ["--import", tsxLoader, "src/server.ts"]);
start("vite", process.execPath, [binScript("vite", "vite")]);
