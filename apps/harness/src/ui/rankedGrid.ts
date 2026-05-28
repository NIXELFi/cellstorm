// Ranked candidate grid. Two views: ALL-TIME (whole catalog, loads immediately on open) and
// LATEST SWEEP (most recent batch). Cards render instantly by their stored score; each candidate's
// cached log is then fetched in the BACKGROUND to (a) re-rank live under an edited ScoreProfile via
// score(log, profile) — no re-sim — and (b) draw its sparkline. Each card has a persistent
// "video made" toggle (POST /api/results/:id/video-made). Re-rank math lives in rerankLogic.

import type { ResultRow } from "@cellstorm/cli";
import type { BattleLog } from "@cellstorm/sim";
import { DEFAULT_PROFILE, type ScoreProfile } from "@cellstorm/score";
import { THEME, teamColor, teamName } from "@cellstorm/render";
import { fetchResults, fetchLog, setVideoMade } from "../api";
import { drawSparkline } from "./sparkline";
import { rerankCandidates, type RankedCandidate } from "./rerankLogic";

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export interface RankedGridOptions {
  onSelect: (row: ResultRow) => void;
}

type View = "all" | "latest";

export class RankedGrid {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly opts: RankedGridOptions;
  private readonly tabAll: HTMLButtonElement;
  private readonly tabLatest: HTMLButtonElement;

  private view: View = "all";
  private latestBatch?: string;

  // State for live re-ranking.
  private rows: ResultRow[] = [];
  private profile: ScoreProfile = DEFAULT_PROFILE;
  // Browser-side log cache (configId -> log) so re-ranking on profile tweaks never refetches.
  private readonly logCache = new Map<string, BattleLog>();

  constructor(opts: RankedGridOptions) {
    this.opts = opts;
    this.el = document.createElement("div");
    this.el.className = "ranked-grid";

    const header = document.createElement("div");
    header.className = "panel-header";
    const title = document.createElement("span");
    title.textContent = "Ranked candidates";
    const tabs = document.createElement("div");
    tabs.className = "tabs";
    this.tabAll = this.tab("All-time", "all");
    this.tabLatest = this.tab("Latest sweep", "latest");
    tabs.append(this.tabAll, this.tabLatest);
    const refresh = document.createElement("button");
    refresh.className = "btn small";
    refresh.textContent = "↻";
    refresh.title = "Refresh";
    refresh.onclick = () => void this.refresh();
    header.append(title, tabs, refresh);

    this.list = document.createElement("div");
    this.list.className = "card-list";
    this.el.append(header, this.list);
    this.syncTabs();
  }

  /** Tell the grid which batch is the most recent (enables/targets the "Latest sweep" tab). */
  setLatestBatch(batchId: string): void {
    this.latestBatch = batchId;
    this.tabLatest.disabled = false;
    if (this.view === "latest") void this.refresh();
  }

  /** Switch to the latest-sweep view (used right after starting a sweep). */
  showLatest(): void {
    if (!this.latestBatch) return;
    this.view = "latest";
    this.syncTabs();
    void this.refresh();
  }

  /** Set the active ScoreProfile and re-rank the loaded candidates over their cached logs. */
  setProfile(profile: ScoreProfile): void {
    this.profile = profile;
    this.renderRanked(); // immediate (cached logs / stored-score fallback)
    void this.ensureLogs().then(() => this.renderRanked());
  }

  async refresh(n = 60): Promise<void> {
    const batch = this.view === "latest" ? this.latestBatch : undefined;
    let rows: ResultRow[];
    try {
      rows = await fetchResults(n, batch);
    } catch (err) {
      this.list.innerHTML = `<div class="empty">Couldn't load results (${
        err instanceof Error ? err.message : String(err)
      })</div>`;
      return;
    }
    this.rows = rows;
    // Render immediately by stored score so the catalog shows the instant the UI opens; logs
    // (for live re-ranking + sparklines) stream in afterward and trigger a re-rank.
    this.renderRanked();
    void this.ensureLogs().then(() => this.renderRanked());
  }

  /** Fetch+cache logs for any loaded candidate we haven't fetched yet (one fetch per id, ever). */
  private async ensureLogs(): Promise<void> {
    const missing = this.rows.filter((r) => !this.logCache.has(r.configId));
    await Promise.all(
      missing.map((r) =>
        fetchLog(r.configId)
          .then((log) => {
            this.logCache.set(r.configId, log);
          })
          .catch(() => {}),
      ),
    );
  }

  private renderRanked(): void {
    this.render(rerankCandidates(this.rows, this.logCache, this.profile));
  }

  private render(ranked: RankedCandidate[]): void {
    this.list.innerHTML = "";
    if (ranked.length === 0) {
      this.list.innerHTML =
        this.view === "latest"
          ? `<div class="empty">No results for the latest sweep yet.</div>`
          : `<div class="empty">No results yet — run a sweep.</div>`;
      return;
    }
    for (const c of ranked) this.list.appendChild(this.card(c));
  }

  private tab(label: string, view: View): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "tab";
    b.textContent = label;
    b.onclick = () => {
      if (this.view === view) return;
      this.view = view;
      this.syncTabs();
      void this.refresh();
    };
    return b;
  }

  private syncTabs(): void {
    this.tabAll.classList.toggle("active", this.view === "all");
    this.tabLatest.classList.toggle("active", this.view === "latest");
    this.tabLatest.disabled = !this.latestBatch;
  }

  private card(c: RankedCandidate): HTMLElement {
    const row = c.row;
    const card = document.createElement("div");
    card.className = "card";
    if (!c.passed) card.classList.add("gate-failed");
    if (row.videoMade) card.classList.add("video-made");
    card.onclick = () => this.opts.onSelect(row);

    const top = document.createElement("div");
    top.className = "card-top";
    const swatches = document.createElement("div");
    swatches.className = "swatches";
    row.config.powers.forEach((power, team) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = hex(teamColor(THEME, team));
      const label = document.createElement("span");
      label.textContent = power;
      chip.title = teamName(THEME, team);
      chip.append(dot, label);
      swatches.appendChild(chip);
    });
    const score = document.createElement("div");
    score.className = "score";
    score.textContent = c.passed ? c.score.toFixed(3) : "gated";
    if (!c.passed) score.classList.add("gated");
    top.append(swatches, score);

    const meta = document.createElement("div");
    meta.className = "card-meta";
    const winner = document.createElement("span");
    winner.className = "badge";
    if (row.winner >= 0) {
      winner.textContent = `Winner: ${teamName(THEME, row.winner)}`;
      winner.style.borderColor = hex(teamColor(THEME, row.winner));
    } else {
      winner.textContent = "Stalemate";
      winner.classList.add("stalemate");
    }
    const seed = document.createElement("span");
    seed.className = "muted";
    const outro = row.config.outroTicks ?? 0;
    const videoSec = (row.durationTicks + outro) / 60;
    seed.textContent = `seed ${row.config.seed} · ${videoSec.toFixed(1)}s`;
    // Video-made toggle — persisted; click doesn't open the player.
    const made = document.createElement("button");
    made.className = "made-toggle";
    const paint = () => {
      made.classList.toggle("on", !!row.videoMade);
      made.textContent = row.videoMade ? "✓ video made" : "mark made";
    };
    paint();
    made.onclick = (e) => {
      e.stopPropagation();
      const next = !row.videoMade;
      row.videoMade = next;
      card.classList.toggle("video-made", next);
      paint();
      void setVideoMade(row.configId, next).catch(() => {
        // revert on failure
        row.videoMade = !next;
        card.classList.toggle("video-made", !next);
        paint();
      });
    };
    meta.append(winner, seed, made);

    const spark = document.createElement("canvas");
    spark.className = "sparkline";
    spark.width = 220;
    spark.height = 36;
    const cached = this.logCache.get(row.configId);
    if (cached) {
      drawSparkline(spark, cached);
    } else {
      void fetchLog(row.configId)
        .then((log) => {
          this.logCache.set(row.configId, log);
          drawSparkline(spark, log);
        })
        .catch(() => {});
    }

    card.append(top, meta, spark);
    return card;
  }
}
