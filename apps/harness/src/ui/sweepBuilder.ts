// Sweep builder: a form composing a SweepSpec (team count pin/sweep, power mode fixed/random/pool,
// seed range, limit, concurrency, topNlogs) with Start/Stop buttons hitting /api/sweep and a live
// progress readout polling /api/sweep/:batch/progress. Spec assembly is delegated to the pure
// sweepLogic module so this file is just DOM wiring.

import { startSweep, stopSweep, fetchProgress, fetchPowers } from "../api";
import {
  DEFAULT_FORM,
  buildSweepSpec,
  estimateRuns,
  type SweepFormState,
} from "./sweepLogic";

export interface SweepBuilderOptions {
  /** Called when a sweep starts (so the grid can scope to the new batch). */
  onBatch: (batchId: string) => void;
}

export class SweepBuilder {
  readonly el: HTMLElement;
  private readonly opts: SweepBuilderOptions;
  private state: SweepFormState = { ...DEFAULT_FORM };
  private powers: string[] = [];
  private activeBatch?: string;
  private pollTimer?: number;
  private readout!: HTMLElement;
  private estimate!: HTMLElement;

  constructor(opts: SweepBuilderOptions) {
    this.opts = opts;
    this.el = document.createElement("div");
    this.el.className = "sweep-builder";
    void this.init();
  }

  private async init(): Promise<void> {
    try {
      this.powers = await fetchPowers();
    } catch {
      this.powers = [];
    }
    this.render();
  }

  private render(): void {
    this.el.innerHTML = "";
    const header = document.createElement("div");
    header.className = "panel-header";
    header.textContent = "Sweep builder";
    this.el.appendChild(header);

    const form = document.createElement("div");
    form.className = "form";

    // Team count
    form.appendChild(
      this.field("Team count", () => {
        const wrap = document.createElement("div");
        wrap.className = "inline";
        const mode = this.select(["pin", "sweep"], this.state.teamCountMode, (v) => {
          this.state.teamCountMode = v as SweepFormState["teamCountMode"];
          this.render();
        });
        wrap.appendChild(mode);
        if (this.state.teamCountMode === "pin") {
          wrap.appendChild(
            this.number(this.state.teamCountPin, 2, 6, (v) => (this.state.teamCountPin = v)),
          );
        } else {
          const list = this.text(this.state.teamCountList.join(","), (v) => {
            this.state.teamCountList = v
              .split(",")
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isFinite(n) && n >= 2 && n <= 6);
            this.updateEstimate();
          });
          list.placeholder = "2,3,4";
          wrap.appendChild(list);
        }
        return wrap;
      }),
    );

    // Powers
    form.appendChild(
      this.field("Powers", () => {
        const wrap = document.createElement("div");
        wrap.className = "stack";
        const mode = this.select(["random", "fixed", "pool"], this.state.powerMode, (v) => {
          this.state.powerMode = v as SweepFormState["powerMode"];
          this.render();
        });
        wrap.appendChild(mode);
        if (this.state.powerMode === "fixed") {
          const tc =
            this.state.teamCountMode === "pin"
              ? this.state.teamCountPin
              : (this.state.teamCountList[0] ?? 2);
          this.state.fixedNames = this.normalizeFixed(tc);
          for (let i = 0; i < tc; i++) {
            const sel = this.select(this.powers, this.state.fixedNames[i] ?? this.powers[0]!, (v) => {
              this.state.fixedNames[i] = v;
            });
            sel.classList.add("power-slot");
            wrap.appendChild(sel);
          }
        } else if (this.state.powerMode === "pool") {
          const grid = document.createElement("div");
          grid.className = "pool-grid";
          for (const p of this.powers) {
            const lbl = document.createElement("label");
            lbl.className = "pool-item";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = this.state.poolNames.includes(p);
            cb.onchange = () => {
              if (cb.checked) this.state.poolNames.push(p);
              else this.state.poolNames = this.state.poolNames.filter((n) => n !== p);
            };
            lbl.append(cb, document.createTextNode(p));
            grid.appendChild(lbl);
          }
          wrap.appendChild(grid);
        }
        return wrap;
      }),
    );

    // Seeds
    form.appendChild(
      this.field("Seeds", () => {
        const wrap = document.createElement("div");
        wrap.className = "inline";
        wrap.appendChild(
          this.number(this.state.seedFrom, 0, 1e9, (v) => {
            this.state.seedFrom = v;
            this.updateEstimate();
          }),
        );
        const dash = document.createElement("span");
        dash.textContent = "–";
        wrap.appendChild(dash);
        wrap.appendChild(
          this.number(this.state.seedTo, 0, 1e9, (v) => {
            this.state.seedTo = v;
            this.updateEstimate();
          }),
        );
        return wrap;
      }),
    );

    // Limit / concurrency / topN
    form.appendChild(
      this.field("Limit / Concurrency / Top-N logs", () => {
        const wrap = document.createElement("div");
        wrap.className = "inline";
        const limit = this.number(this.state.limit ?? 0, 0, 1e9, (v) => {
          this.state.limit = v > 0 ? v : undefined;
          this.updateEstimate();
        });
        limit.placeholder = "no limit";
        wrap.appendChild(limit);
        wrap.appendChild(
          this.number(this.state.concurrency ?? 4, 1, 64, (v) => (this.state.concurrency = v)),
        );
        wrap.appendChild(
          this.number(this.state.topNlogs ?? 25, 0, 1000, (v) => (this.state.topNlogs = v)),
        );
        return wrap;
      }),
    );

    this.el.appendChild(form);

    this.estimate = document.createElement("div");
    this.estimate.className = "muted estimate";
    this.el.appendChild(this.estimate);
    this.updateEstimate();

    const buttons = document.createElement("div");
    buttons.className = "inline buttons";
    const start = document.createElement("button");
    start.className = "btn primary";
    start.textContent = "Start sweep";
    start.onclick = () => void this.start();
    const stop = document.createElement("button");
    stop.className = "btn";
    stop.textContent = "Stop";
    stop.onclick = () => void this.stop();
    buttons.append(start, stop);
    this.el.appendChild(buttons);

    this.readout = document.createElement("div");
    this.readout.className = "readout";
    this.el.appendChild(this.readout);
  }

  private normalizeFixed(tc: number): string[] {
    const names = [...this.state.fixedNames];
    while (names.length < tc) names.push(this.powers[names.length % Math.max(1, this.powers.length)] ?? "Tank");
    return names.slice(0, tc);
  }

  private updateEstimate(): void {
    if (this.estimate) this.estimate.textContent = `≈ ${estimateRuns(this.state)} battles`;
  }

  private async start(): Promise<void> {
    let spec;
    try {
      spec = buildSweepSpec(this.state);
    } catch (err) {
      this.readout.textContent = `Invalid spec: ${err instanceof Error ? err.message : String(err)}`;
      return;
    }
    try {
      const { batchId } = await startSweep({
        spec,
        concurrency: this.state.concurrency,
        topNlogs: this.state.topNlogs,
      });
      this.activeBatch = batchId;
      this.opts.onBatch(batchId);
      this.readout.textContent = `Started ${batchId}…`;
      this.startPolling();
    } catch (err) {
      this.readout.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private async stop(): Promise<void> {
    if (!this.activeBatch) return;
    try {
      await stopSweep(this.activeBatch);
      this.readout.textContent = `Stop requested for ${this.activeBatch}…`;
    } catch (err) {
      this.readout.textContent = `Stop failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private startPolling(): void {
    if (this.pollTimer) window.clearInterval(this.pollTimer);
    this.pollTimer = window.setInterval(() => void this.poll(), 1000);
  }

  private async poll(): Promise<void> {
    if (!this.activeBatch) return;
    try {
      const p = await fetchProgress(this.activeBatch);
      const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
      this.readout.textContent = `${this.activeBatch}: ${p.done}/${p.total} (${pct}%) · best ${p.best.toFixed(
        3,
      )} · ${p.running ? "running" : "done"}`;
      if (!p.running && p.total > 0) {
        window.clearInterval(this.pollTimer);
        this.pollTimer = undefined;
      }
    } catch {
      /* keep polling */
    }
  }

  // --- tiny DOM helpers ----------------------------------------------------
  private field(label: string, body: () => HTMLElement): HTMLElement {
    const row = document.createElement("div");
    row.className = "field";
    const l = document.createElement("label");
    l.className = "field-label";
    l.textContent = label;
    row.append(l, body());
    return row;
  }
  private select(options: string[], value: string, onChange: (v: string) => void): HTMLSelectElement {
    const sel = document.createElement("select");
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o;
      if (o === value) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.onchange = () => onChange(sel.value);
    return sel;
  }
  private number(value: number, min: number, max: number, onChange: (v: number) => void): HTMLInputElement {
    const inp = document.createElement("input");
    inp.type = "number";
    inp.value = String(value);
    inp.min = String(min);
    inp.max = String(max);
    inp.oninput = () => onChange(Number(inp.value));
    return inp;
  }
  private text(value: string, onChange: (v: string) => void): HTMLInputElement {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = value;
    inp.oninput = () => onChange(inp.value);
    return inp;
  }
}
