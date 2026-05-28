// PURE builder for the renderer CLI invocation used by "Send to render". The harness can't spawn
// the Playwright renderer in-browser, so we build the exact working command the user can paste into
// a terminal. Flags match apps/renderer/src/cli.ts: --config --db --out [--hud] [--scale] etc.
// Unit-tested in test/renderCommand.test.ts.

import type { HudConfig } from "@cellstorm/render";

export interface RenderCommandInput {
  configId: string;
  dbPath: string;
  out?: string;
  hud?: HudConfig;
}

/** Single-quote a value for a POSIX shell, escaping embedded single quotes. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build the `pnpm --filter @cellstorm/renderer render ...` command for the given config + HUD.
 * The HUD is serialized to JSON and shell-quoted so it survives a copy/paste into a terminal.
 */
export function buildRenderCommand(input: RenderCommandInput): string {
  const out = input.out ?? "out.mp4";
  const parts = [
    "pnpm",
    "--filter",
    "@cellstorm/renderer",
    "render",
    "--config",
    shellQuote(input.configId),
    "--db",
    shellQuote(input.dbPath),
    "--out",
    shellQuote(out),
  ];
  if (input.hud) {
    parts.push("--hud", shellQuote(JSON.stringify(input.hud)));
  }
  return parts.join(" ");
}
