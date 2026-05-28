// PURE render-progress model, shared by the bridge (server.ts), the API types (api.ts), and the
// player UI (playerPanel.ts). No DOM / Node imports, so it runs in both and is unit-testable.

export type RenderPhase = "rendering" | "encoding" | "done" | "error";

export interface RenderProgress {
  state: RenderPhase;
  frames: number; // frames captured so far
  total: number; // total frames to capture (0 until the renderer announces it)
  startedAt: number; // epoch ms when the render started
  encodeStartedAt?: number; // epoch ms when encoding began
  out: string; // output mp4 path
  error?: string;
}

/** Initial state when a render is kicked off. */
export function initialRenderProgress(out: string, now: number): RenderProgress {
  return { state: "rendering", frames: 0, total: 0, startedAt: now, out };
}

/**
 * Fold a chunk of the renderer CLI's stdout into the progress state. Pure: returns a new object.
 * Recognizes "Total frames: N", "N frames captured", and the "Encoding..." transition. The terminal
 * done/error states are driven by the child's exit code (set by the caller), not by stdout.
 */
export function applyRenderStdout(prev: RenderProgress, chunk: string, now: number): RenderProgress {
  let next = prev;

  const totalM = /Total frames:\s*(\d+)/.exec(chunk);
  if (totalM) next = { ...next, total: Number(totalM[1]) };

  // A chunk may contain several "N frames captured" lines; the last one is the most recent count.
  const caps = chunk.match(/(\d+) frames captured/g);
  if (caps && caps.length > 0) {
    const last = /(\d+) frames captured/.exec(caps[caps.length - 1]!)!;
    next = { ...next, frames: Number(last[1]) };
  }

  if (/Encoding\.\.\./.test(chunk)) {
    next = {
      ...next,
      state: "encoding",
      frames: next.total > 0 ? next.total : next.frames, // capture is complete at this point
      encodeStartedAt: next.encodeStartedAt ?? now,
    };
  }

  return next;
}

export interface RenderView {
  fraction: number; // bar fill in [0,1]
  indeterminate: boolean; // animate as a sweep (encoding, or capture before the total is known)
  label: string; // human-readable status line
  terminal: boolean; // render finished (done|error) — caller can stop polling
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

/** Derive the bar fraction + status label (incl. ETA) for the current state. Pure; `now` injected. */
export function renderView(p: RenderProgress, now: number): RenderView {
  const elapsed = Math.max(0, (now - p.startedAt) / 1000);

  if (p.state === "error") {
    return { fraction: 0, indeterminate: false, terminal: true, label: `Render failed: ${p.error ?? "unknown error"}` };
  }
  if (p.state === "done") {
    return { fraction: 1, indeterminate: false, terminal: true, label: `Done in ${formatDuration(elapsed)} — revealed + opened` };
  }
  if (p.state === "encoding") {
    const enc = p.encodeStartedAt ? Math.max(0, (now - p.encodeStartedAt) / 1000) : 0;
    return { fraction: 1, indeterminate: true, terminal: false, label: `Encoding to MP4… (${formatDuration(enc)})` };
  }
  // rendering
  if (p.total <= 0) {
    return { fraction: 0, indeterminate: true, terminal: false, label: "Preparing render…" };
  }
  const fraction = Math.min(1, p.frames / p.total);
  const pct = Math.round(fraction * 100);
  let eta = "";
  if (p.frames > 0 && p.frames < p.total && elapsed > 0) {
    const rate = p.frames / elapsed; // frames/sec
    if (rate > 0) eta = ` · ~${formatDuration((p.total - p.frames) / rate)} left`;
  }
  return { fraction, indeterminate: false, terminal: false, label: `Rendering ${p.frames}/${p.total} (${pct}%)${eta}` };
}
