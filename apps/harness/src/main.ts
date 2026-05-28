// Harness entry: assembles the panels into a three-column layout — left: sweep builder + ranked
// grid; center: player; right: HUD editor + tuning. Selecting a candidate loads its exact config
// into the player; starting a sweep scopes the grid to the new batch and auto-refreshes.

import "./styles.css";
import { fetchConfig } from "./api";
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
  onBatch: () => {
    // Keep the grid showing the whole catalog (not scoped to the new batch): a sweep that
    // resume-skips already-computed configs adds nothing to its own batch, but the catalog
    // still holds results worth seeing, and new high-scorers float up by score as they land.
    grid.setBatch(undefined);
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
left.append(builder.el, profileEditor.el, grid.el);

const center = document.createElement("div");
center.className = "col col-center";
center.append(player.el);

const right = document.createElement("div");
right.className = "col col-right";
right.append(hudEditor.el, tuning.el);

root.append(left, center, right);

// Initial load of any existing results.
void grid.refresh();
