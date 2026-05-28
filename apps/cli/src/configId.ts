// Single source of truth for the stable battle configId format. This file has ZERO node deps
// (no better-sqlite3, no node:*) so it is safe to import into the browser harness bundle via the
// "@cellstorm/cli/config-id" subpath export. store.ts and the package index re-export from here.

/**
 * Stable configId for a battle config: `${teamCount}:${powers.join(",")}:${seed}`.
 * The lab, harness, and renderer all derive ids through this one function.
 */
export function configIdOf(c: { teamCount: number; powers: string[]; seed: number }): string {
  return `${c.teamCount}:${c.powers.join(",")}:${c.seed}`;
}

/** @deprecated use {@link configIdOf}. Kept as an alias for existing call sites. */
export const configId = configIdOf;
