// Ranked candidate grid: fetches /api/results and renders a card per battle (team color swatches
// + power names, score, winner badge). It supports LIVE re-ranking under an edited ScoreProfile:
// when the profile changes, each loaded candidate's cached log is re-scored client-side via
// score(log, profile) and the grid re-sorts by the new score — NO re-simulation, NO sweep. Logs
// are fetched once via GET /api/log/:id and cached in the browser, so subsequent weight tweaks are
// instant. Gate failures (passed=false) sort to the bottom and are visually marked. The pure
// re-rank math lives in rerankLogic; this file is DOM wiring + the browser log cache.

import type { ResultRow } from "@cellstorm/cli";
import type { BattleLog } from "@cellstorm/sim";
import { DEFAULT_PROFILE, type ScoreProfile } from "@cellstorm/score";
import { THEME, teamColor, teamName } from "@cellstorm/render";
import { fetchResults, fetchLog } from "../api";
import { drawSparkline } from "./sparkline";
import { rerankCandidates, type RankedCandidate } from "./rerankLogic";

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export interface RankedGridOptions {
  onSelect: (row: ResultRow) => void;
}

export class RankedGrid {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly opts: RankedGridOptions;
  private currentBatch?: string;

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
    header.textContent = "Ranked candidates";
    const refresh = document.createElement("button");
    refresh.className = "btn small";
    refresh.textContent = "Refresh";
    refresh.onclick = () => void this.refresh();
    header.appendChild(refresh);
    this.list = document.createElement("div");
    this.list.className = "card-list";
    this.el.append(header, this.list);
  }

  setBatch(batch: string | undefined): void {
    this.currentBatch = batch;
  }

  /** Set the active ScoreProfile and re-rank the loaded candidates over their cached logs. */
  setProfile(profile: ScoreProfile): void {
    this.profile = profile;
    // Ensure logs for the loaded candidates are fetched+cached, then re-render in new order.
    void this.ensureLogs().then(() => this.renderRanked());
    // Render immediately too (using whatever logs are already cached) so the UI is responsive.
    this.renderRanked();
  }

  async refresh(n = 60): Promise<void> {
    let rows: ResultRow[];
    try {
      rows = await fetchResults(n, this.currentBatch);
    } catch (err) {
      this.list.innerHTML = `<div class="empty">No results yet (${
        err instanceof Error ? err.message : String(err)
      })</div>`;
      return;
    }
    this.rows = rows;
    await this.ensureLogs();
    this.renderRanked();
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
          // Non-fatal: a missing log just means this card uses its stored score for now.
          .catch(() => {}),
      ),
    );
  }

  private renderRanked(): void {
    const ranked = rerankCandidates(this.rows, this.logCache, this.profile);
    this.render(ranked);
  }

  private render(ranked: RankedCandidate[]): void {
    this.list.innerHTML = "";
    if (ranked.length === 0) {
      this.list.innerHTML = `<div class="empty">No results yet — run a sweep.</div>`;
      return;
    }
    for (const c of ranked) {
      this.list.appendChild(this.card(c));
    }
  }

  private card(c: RankedCandidate): HTMLElement {
    const row = c.row;
    const card = document.createElement("div");
    card.className = "card";
    if (!c.passed) card.classList.add("gate-failed");
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
    // Video length = fight duration + the victory-beat outro, in seconds @ 60fps.
    const outro = row.config.outroTicks ?? 0;
    const videoSec = (row.durationTicks + outro) / 60;
    seed.textContent = `seed ${row.config.seed} · ${videoSec.toFixed(1)}s`;
    meta.append(winner, seed);

    const spark = document.createElement("canvas");
    spark.className = "sparkline";
    spark.width = 220;
    spark.height = 36;
    // Draw from the cached log if we have it; else lazily fetch (and cache) it. Non-fatal on error.
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
