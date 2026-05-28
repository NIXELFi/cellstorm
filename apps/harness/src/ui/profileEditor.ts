// ScoreProfile editor: sliders/number inputs for the five drama weights and the gate fields.
// Starts from DEFAULT_PROFILE. On any change it emits the new profile (debounced one frame) so the
// ranked grid can re-rank cached logs client-side — no re-simulation, no sweep. Pure DOM wiring;
// the actual re-rank math lives in the pure rerankLogic module.

import { DEFAULT_PROFILE, type ScoreProfile } from "@cellstorm/score";

export interface ProfileEditorOptions {
  /** Fired whenever the profile changes (after a frame's debounce). */
  onChange: (profile: ScoreProfile) => void;
}

type WeightKey = keyof ScoreProfile["weights"];

const WEIGHT_FIELDS: { key: WeightKey; label: string }[] = [
  { key: "leadVolatility", label: "Lead volatility" },
  { key: "comeback", label: "Comeback" },
  { key: "climaxTiming", label: "Climax timing" },
  { key: "closeFinish", label: "Close finish" },
  { key: "sustainedChaos", label: "Sustained chaos" },
];

const GATE_FIELDS: { key: keyof ScoreProfile; label: string; min: number; max: number; step: number }[] = [
  { key: "targetMinSec", label: "Target min (s)", min: 0, max: 600, step: 1 },
  { key: "targetMaxSec", label: "Target max (s)", min: 0, max: 600, step: 1 },
  { key: "maxStalemateSec", label: "Max stalemate (s)", min: 0, max: 600, step: 1 },
];

/** Deep-clone a ScoreProfile (plain JSON, no functions). */
function cloneProfile(p: ScoreProfile): ScoreProfile {
  return { ...p, weights: { ...p.weights } };
}

export class ProfileEditor {
  readonly el: HTMLElement;
  private readonly opts: ProfileEditorOptions;
  private profile: ScoreProfile = cloneProfile(DEFAULT_PROFILE);
  private emitScheduled = false;

  constructor(opts: ProfileEditorOptions) {
    this.opts = opts;
    this.el = document.createElement("div");
    this.el.className = "profile-editor";
    this.render();
  }

  /** The current profile (a copy — callers can't mutate internal state). */
  getProfile(): ScoreProfile {
    return cloneProfile(this.profile);
  }

  private render(): void {
    this.el.innerHTML = "";
    const header = document.createElement("div");
    header.className = "panel-header";
    header.textContent = "Score profile";
    const reset = document.createElement("button");
    reset.className = "btn small";
    reset.textContent = "Reset";
    reset.onclick = () => {
      this.profile = cloneProfile(DEFAULT_PROFILE);
      this.render();
      this.scheduleEmit();
    };
    header.appendChild(reset);
    this.el.appendChild(header);

    const weights = document.createElement("div");
    weights.className = "form";
    for (const f of WEIGHT_FIELDS) {
      weights.appendChild(
        this.weightRow(f.label, this.profile.weights[f.key], (v) => {
          this.profile.weights[f.key] = v;
        }),
      );
    }
    this.el.appendChild(weights);

    const gates = document.createElement("div");
    gates.className = "form gates";
    for (const f of GATE_FIELDS) {
      gates.appendChild(
        this.numberRow(f.label, this.profile[f.key] as number, f.min, f.max, f.step, (v) => {
          (this.profile[f.key] as number) = v;
        }),
      );
    }
    this.el.appendChild(gates);
  }

  /** A weight row: slider + synced number input (range 0..3, step 0.1). */
  private weightRow(label: string, value: number, set: (v: number) => void): HTMLElement {
    const row = document.createElement("div");
    row.className = "field profile-field";
    const l = document.createElement("label");
    l.className = "field-label";
    l.textContent = label;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "3";
    slider.step = "0.1";
    slider.value = String(value);
    slider.className = "weight-slider";

    const num = document.createElement("input");
    num.type = "number";
    num.min = "0";
    num.max = "3";
    num.step = "0.1";
    num.value = String(value);
    num.className = "weight-num";

    const commit = (raw: string, sync: HTMLInputElement) => {
      const v = Number(raw);
      if (!Number.isFinite(v)) return;
      set(v);
      sync.value = String(v);
      this.scheduleEmit();
    };
    slider.oninput = () => commit(slider.value, num);
    num.oninput = () => commit(num.value, slider);

    const inline = document.createElement("div");
    inline.className = "inline";
    inline.append(slider, num);
    row.append(l, inline);
    return row;
  }

  private numberRow(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    set: (v: number) => void,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "field profile-field";
    const l = document.createElement("label");
    l.className = "field-label";
    l.textContent = label;
    const num = document.createElement("input");
    num.type = "number";
    num.min = String(min);
    num.max = String(max);
    num.step = String(step);
    num.value = String(value);
    num.oninput = () => {
      const v = Number(num.value);
      if (!Number.isFinite(v)) return;
      set(v);
      this.scheduleEmit();
    };
    row.append(l, num);
    return row;
  }

  /** Coalesce rapid input events into a single emit on the next frame. */
  private scheduleEmit(): void {
    if (this.emitScheduled) return;
    this.emitScheduled = true;
    requestAnimationFrame(() => {
      this.emitScheduled = false;
      this.opts.onChange(this.getProfile());
    });
  }
}
