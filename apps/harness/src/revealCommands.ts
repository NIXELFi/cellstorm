// PURE: given the OS platform and a file path, return the commands to (1) reveal the file in the
// system file manager and (2) open it in the default app. The bridge spawns these best-effort after
// a render finishes. Kept pure (no spawning) so the per-OS branching is unit-tested directly.

export interface RevealCommand {
  cmd: string;
  args: string[];
}

export function revealCommands(platform: NodeJS.Platform, file: string): RevealCommand[] {
  if (platform === "darwin") {
    return [
      { cmd: "open", args: ["-R", file] }, // reveal + select in Finder
      { cmd: "open", args: [file] }, // open in the default player
    ];
  }
  if (platform === "win32") {
    return [
      // explorer reveals + selects the file; it exits non-zero even on success, but we ignore codes.
      { cmd: "explorer", args: [`/select,${file}`] },
      // `start` is a cmd builtin; the empty "" is the (required) window-title argument.
      { cmd: "cmd", args: ["/c", "start", "", file] },
    ];
  }
  // Linux / other: best-effort open. There's no portable "reveal and select", so just open it.
  return [{ cmd: "xdg-open", args: [file] }];
}
