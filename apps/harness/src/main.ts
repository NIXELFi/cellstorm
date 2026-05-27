// Harness entry: assembles the panels into a three-column layout — left: sweep builder + ranked
// grid; center: player; right: HUD editor + tuning. Selecting a candidate loads its exact config
// into the player; starting a sweep scopes the grid to the new batch and auto-refreshes.

import "./styles.css";
import { fetchConfig } from "./api";
import { SweepBuilder } from "./ui/sweepBuilder";
import { RankedGrid } from "./ui/rankedGrid";
import { PlayerPanel } from "./ui/playerPanel";
import { HudEditor } from "./ui/hudEditor";
import { TuningPanel } from "./ui/tuningPanel";

const root = document.getElementById("app")!;

const player = new PlayerPanel();
const hudEditor = new HudEditor(player);
const tuning = new TuningPanel(player);

player.onReady(() => {
  hudEditor.refresh();
});

const grid = new RankedGrid({
  onSelect: (row) => {
    // Load the exact stored config (defensive: re-fetch to be sure it's complete).
    void fetchConfig(row.configId)
      .then((cfg) => {
        tuning.reset();
        return player.load(cfg);
      })
      .catch(() => player.load(row.config));
  },
});

const builder = new SweepBuilder({
  onBatch: (batchId) => {
    grid.setBatch(batchId);
    // Poll the grid a few times as results land.
    let n = 0;
    const t = window.setInterval(() => {
      void grid.refresh();
      if (++n > 60) window.clearInterval(t);
    }, 2000);
  },
});

// Layout
const left = document.createElement("div");
left.className = "col col-left";
left.append(builder.el, grid.el);

const center = document.createElement("div");
center.className = "col col-center";
center.append(player.el);

const right = document.createElement("div");
right.className = "col col-right";
right.append(hudEditor.el, tuning.el);

root.append(left, center, right);

// Initial load of any existing results.
void grid.refresh();
