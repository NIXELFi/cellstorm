// Harness entry: assembles the panels into a three-column layout — left: sweep builder + ranked
// grid; center: player; right: HUD editor + tuning. Selecting a candidate loads its exact config
// into the player; starting a sweep scopes the grid to the new batch and auto-refreshes.

import "./styles.css";
import { fetchConfig, fetchLatestBatch } from "./api";
import { SweepBuilder } from "./ui/sweepBuilder";
import { RankedGrid } from "./ui/rankedGrid";
import { ProfileEditor } from "./ui/profileEditor";
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

// ScoreProfile editor: edits weights/gates and live re-ranks the grid over cached logs.
const profileEditor = new ProfileEditor({
  onChange: (profile) => grid.setProfile(profile),
});
grid.setProfile(profileEditor.getProfile());

const builder = new SweepBuilder({
  onBatch: (batchId) => {
    // Focus the grid on the new sweep so its top candidates surface as they land; the All-time
    // view remains one click away.
    grid.setLatestBatch(batchId);
    grid.showLatest();
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
right.append(hudEditor.el, tuning.el, profileEditor.el);

root.append(left, center, right);

// Initial load: show the all-time catalog immediately, and enable the "Latest sweep" tab if the
// store already has a most-recent batch from a prior session.
void grid.refresh();
void fetchLatestBatch()
  .then(({ batchId }) => {
    if (batchId) grid.setLatestBatch(batchId);
  })
  .catch(() => {});
