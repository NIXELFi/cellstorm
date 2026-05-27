// Ranked candidate grid: fetches /api/results and renders a card per battle (team color swatches
// + power names, score, winner badge), sorted by score (the API already returns score DESC).
// Clicking a card opens the player for that config. Each card lazily renders its population
// sparkline from the battle log.

import type { ResultRow } from "@cellstorm/cli";
import { THEME, teamColor, teamName } from "@cellstorm/render";
import { fetchResults, fetchLog } from "../api";
import { drawSparkline } from "./sparkline";

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
    this.render(rows);
  }

  private render(rows: ResultRow[]): void {
    this.list.innerHTML = "";
    if (rows.length === 0) {
      this.list.innerHTML = `<div class="empty">No results yet — run a sweep.</div>`;
      return;
    }
    for (const row of rows) {
      this.list.appendChild(this.card(row));
    }
  }

  private card(row: ResultRow): HTMLElement {
    const card = document.createElement("div");
    card.className = "card";
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
    score.textContent = row.score.toFixed(3);

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
    seed.textContent = `seed ${row.config.seed} · ${row.durationTicks}t`;
    meta.append(winner, seed);

    const spark = document.createElement("canvas");
    spark.className = "sparkline";
    spark.width = 220;
    spark.height = 36;
    // Lazily fetch the log and draw; failures are non-fatal (card still shows).
    void fetchLog(row.configId)
      .then((log) => drawSparkline(spark, log))
      .catch(() => {});

    card.append(top, meta, spark);
    return card;
  }
}
