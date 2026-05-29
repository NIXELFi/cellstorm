// BROWSER entry (esbuild -> IIFE, injected by Playwright). Draws the tournament's NON-battle visuals as
// tick-driven DOM/CSS: intro, per-match bracket beats, podium, and the static broadcast match "frame"
// (side panels composited around the portrait battle clip). EVERY animated value is a function of the
// frame tick — never a CSS transition/keyframe, which would freeze in the wall-clock-decoupled capture
// loop (same lesson as CssHud). No pixi: pure DOM, crisp at 4K.
//
// Aesthetic: a neon-arena esports broadcast — deep near-black field with a drifting parallax grid,
// Anton/Archivo type (matching the in-battle HUD) + a mono telemetry voice, glowing team-colored panels
// with corner-bracket framing, and a real connector-lined bracket. Sizes use container-query units
// (cqh/cqw) so the look is identical at 720p and 4K.
import { competitorRect, championRect, type Rect, type Region } from "./bracketLayout";
import { slotColor, cssHex, PODIUM_COLORS } from "../colors";
import { frameLayout } from "../format";
import type { ScenePayload, BeatPayload, IntroPayload, PodiumPayload, MatchFramePayload, BracketState } from "./sceneData";
import type { Round } from "../types";

interface InitArgs {
  payload: ScenePayload;
  width: number;
  height: number;
  totalFrames: number;
}

declare global {
  interface Window {
    __scene: {
      init(args: InitArgs): void;
      drawFrame(tick: number): void;
    };
  }
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (p: number) => 1 - Math.pow(1 - clamp01(p), 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const px = (n: number) => `${n}px`;

type Updater = (p: number) => void;

let root: HTMLElement;
let W = 0;
let H = 0;
let TOTAL = 1;
let isStatic = false;
const updaters: Updater[] = [];

const FONT_LINK_ID = "cs-tourney-fonts";
const STYLE_ID = "cs-tourney-style";

function ensureFonts(): void {
  if (document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap";
  document.head.appendChild(link);
}

const CSS = `
.scene {
  position: absolute; inset: 0; overflow: hidden; container-type: size;
  font-family: "Archivo", system-ui, sans-serif; color: #eef0f7; line-height: 1.15;
  --display: "Anton", "Archivo", sans-serif;
  --mono: "DM Mono", ui-monospace, monospace;
  --muted: rgba(228,232,246,0.52);
  --faint: rgba(228,232,246,0.30);
  --cyan: #22d3ee;
  --gold: #ffcc40;
  background:
    radial-gradient(125% 90% at 50% 22%, #15182b 0%, #0a0b16 46%, #050610 78%);
}
/* ---- atmosphere ---- */
.atmo { position: absolute; inset: 0; pointer-events: none; }
.atmo-dots {
  position: absolute; inset: -10%;
  background-image: radial-gradient(circle, rgba(34,211,238,0.16) 0.16cqh, transparent 0.26cqh);
  background-size: 4.4cqh 4.4cqh;
}
.atmo-dots2 {
  position: absolute; inset: -10%;
  background-image: radial-gradient(circle, rgba(120,132,255,0.10) 0.26cqh, transparent 0.4cqh);
  background-size: 8.2cqh 8.2cqh;
}
.atmo-scan {
  position: absolute; inset: 0; opacity: 0.5; mix-blend-mode: overlay;
  background: repeating-linear-gradient(to bottom, rgba(255,255,255,0.025) 0 0.09cqh, transparent 0.09cqh 0.34cqh);
}
.atmo-vign {
  position: absolute; inset: 0;
  background: radial-gradient(135% 105% at 50% 42%, transparent 50%, rgba(2,3,8,0.66) 100%);
}
.atmo-glow {
  position: absolute; left: 50%; top: -22%; width: 120cqh; height: 60cqh; transform: translateX(-50%);
  background: radial-gradient(closest-side, rgba(34,211,238,0.10), transparent 70%);
}

/* ---- type ---- */
.eyebrow {
  font-weight: 700; text-transform: uppercase; letter-spacing: 0.46em; text-indent: 0.46em;
  color: var(--faint); font-size: 1.5cqh;
}
.title {
  font-family: var(--display); text-transform: uppercase; line-height: 0.98; letter-spacing: 0.01em;
  background: linear-gradient(180deg, #ffffff 0%, #c4c9dc 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0.5cqh 2.2cqh rgba(0,0,0,0.5));
}
.rule {
  height: 0.28cqh; border-radius: 1cqh; width: 12cqh;
  background: linear-gradient(90deg, transparent, var(--cyan), transparent);
  box-shadow: 0 0 1.4cqh rgba(34,211,238,0.6);
}
.mono { font-family: var(--mono); letter-spacing: 0.04em; }
.tnum { font-variant-numeric: tabular-nums; }

/* ---- panels + framing ---- */
.panel {
  position: absolute; box-sizing: border-box;
  background: linear-gradient(180deg, rgba(16,18,32,0.66), rgba(9,10,20,0.62));
  border: 0.13cqh solid rgba(255,255,255,0.08);
  border-radius: 1.4cqh;
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  box-shadow: 0 1.4cqh 4cqh rgba(0,0,0,0.42), inset 0 0 4cqh rgba(255,255,255,0.015);
}
.panel.accent { border-top: 0.34cqh solid var(--c); box-shadow: 0 1.4cqh 4cqh rgba(0,0,0,0.42), 0 -0.1cqh 2.4cqh -0.6cqh var(--c); }
.corner { position: absolute; width: 1.8cqh; height: 1.8cqh; border: 0.26cqh solid var(--cyan); opacity: 0.85;
  filter: drop-shadow(0 0 0.7cqh rgba(34,211,238,0.55)); }
.corner.tl { left: -0.13cqh; top: -0.13cqh; border-right: none; border-bottom: none; border-top-left-radius: 1.2cqh; }
.corner.tr { right: -0.13cqh; top: -0.13cqh; border-left: none; border-bottom: none; border-top-right-radius: 1.2cqh; }
.corner.bl { left: -0.13cqh; bottom: -0.13cqh; border-right: none; border-top: none; border-bottom-left-radius: 1.2cqh; }
.corner.br { right: -0.13cqh; bottom: -0.13cqh; border-left: none; border-top: none; border-bottom-right-radius: 1.2cqh; }
.panel-label {
  position: absolute; top: 1.2cqh; left: 0; right: 0; text-align: center;
}

/* ---- bracket ---- */
.bx {
  position: absolute; box-sizing: border-box; display: flex; align-items: center; justify-content: center;
  padding: 0 0.5cqh; border-radius: 0.6cqh; white-space: nowrap; overflow: hidden;
  font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase;
  border: 0.12cqh solid color-mix(in srgb, var(--c) 45%, transparent);
  background: color-mix(in srgb, var(--c) 9%, rgba(10,12,22,0.55));
  color: #dfe4f4;
}
.bx.win { color: #fff; background: color-mix(in srgb, var(--c) 26%, rgba(10,12,22,0.5));
  border-color: var(--c); box-shadow: 0 0 1.2cqh -0.2cqh var(--c), inset 0 0 1cqh -0.4cqh var(--c); }
.bx.lose { color: rgba(255,255,255,0.4); border-color: rgba(255,255,255,0.12); }
.bx.lose .nm { text-decoration: line-through; text-decoration-color: rgba(255,255,255,0.4); }
.bx.tbd { color: rgba(255,255,255,0.34); border-style: dashed; border-color: rgba(255,255,255,0.14); background: rgba(10,12,22,0.4); }
.bx.champ { border-color: var(--gold); color: #fff;
  background: linear-gradient(180deg, color-mix(in srgb, var(--gold) 34%, rgba(10,12,22,0.4)), rgba(10,12,22,0.5));
  box-shadow: 0 0 2.4cqh -0.4cqh var(--gold); }
.conn { position: absolute; background: rgba(120,150,200,0.22); }
.conn.hot { background: var(--cyan); box-shadow: 0 0 0.7cqh rgba(34,211,238,0.7); }

/* ---- competitor rows (matchup card) ---- */
.comp {
  position: absolute; box-sizing: border-box; display: flex; align-items: center; gap: 1.4cqh;
  padding: 0 1.6cqh; border-radius: 1cqh;
  background: linear-gradient(90deg, color-mix(in srgb, var(--c) 26%, transparent), color-mix(in srgb, var(--c) 7%, rgba(10,12,22,0.4)));
  border: 0.16cqh solid var(--c);
  box-shadow: 0 0 2.4cqh -0.8cqh var(--c), inset 0 0 2cqh -1cqh var(--c);
}
.comp-dot { border-radius: 50%; background: var(--c); flex: 0 0 auto; box-shadow: 0 0 1.4cqh var(--c); }
.comp-name { font-family: var(--display); text-transform: uppercase; letter-spacing: 0.02em; color: #fff;
  white-space: nowrap; overflow: hidden; text-shadow: 0 0.2cqh 0.9cqh rgba(0,0,0,0.6); }
.vs { position: absolute; font-family: var(--display); color: var(--faint); text-align: center; }
.comp-text { display: flex; flex-direction: column; gap: 0.4cqh; min-width: 0; overflow: hidden; }
.comp-desc { font-weight: 600; letter-spacing: 0.01em; color: var(--muted); text-transform: none;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.intro-logo { height: 15cqh; width: auto; max-width: 42cqh; object-fit: contain;
  border-radius: 1.4cqh; filter: drop-shadow(0 0.6cqh 2.6cqh rgba(0,0,0,0.55)); }

/* ---- podium ---- */
.ped { position: absolute; box-sizing: border-box; border-radius: 1cqh 1cqh 0 0;
  background: linear-gradient(180deg, color-mix(in srgb, var(--c) 78%, #fff 6%), color-mix(in srgb, var(--c) 60%, #000 22%));
  box-shadow: 0 0 4cqh -1cqh var(--c), inset 0 0.3cqh 0 rgba(255,255,255,0.25); }
.ped-rank { position: absolute; left: 0; right: 0; top: 1.2cqh; text-align: center; font-family: var(--display);
  color: rgba(0,0,0,0.5); }
.ped-name { position: absolute; text-align: center; font-family: var(--display); text-transform: uppercase;
  color: #fff; text-shadow: 0 0.3cqh 1.4cqh rgba(0,0,0,0.6); }
.ped-medal { position: absolute; border-radius: 50%; background: radial-gradient(circle at 38% 32%, #fff7, var(--c));
  box-shadow: 0 0 2.6cqh -0.4cqh var(--c); border: 0.2cqh solid rgba(255,255,255,0.55); }

/* ---- brand strip / footer (match frame) ---- */
.brand { position: absolute; display: flex; align-items: center; justify-content: center; gap: 1.2cqh; }
.brand-mark { width: 1.3cqh; height: 1.3cqh; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 1.2cqh var(--cyan); }
.foot { position: absolute; left: 0; right: 0; bottom: 1.6cqh; display: flex; align-items: center; justify-content: center; gap: 1.4cqh;
  color: var(--faint); }
.bezel { position: absolute; box-sizing: border-box; border-radius: 1cqh;
  border: 0.16cqh solid rgba(255,255,255,0.10);
  box-shadow: 0 0 6cqh -1.5cqh rgba(34,211,238,0.5), inset 0 0 3cqh rgba(0,0,0,0.5); }
.bezel-edge { position: absolute; height: 0.4cqh; left: 8%; right: 8%; border-radius: 1cqh; background: var(--c); box-shadow: 0 0 1.6cqh var(--c); }
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function fullRegion(): Region {
  return { x: 0, y: 0, w: W, h: H };
}

function key(round: Round, m: number, side: 0 | 1): string {
  return `${round}:${m}:${side}`;
}

function el(parent: HTMLElement, className: string, style?: Partial<CSSStyleDeclaration>): HTMLElement {
  const e = document.createElement("div");
  e.className = className;
  if (style) Object.assign(e.style, style);
  parent.appendChild(e);
  return e;
}

function rect(e: HTMLElement, r: Rect): void {
  e.style.left = px(r.x);
  e.style.top = px(r.y);
  e.style.width = px(r.w);
  e.style.height = px(r.h);
}

function setVar(e: HTMLElement, name: string, value: string): void {
  e.style.setProperty(name, value);
}

/** Four glowing corner brackets on a panel-like element (which must be position:relative/absolute). */
function cornerBrackets(panel: HTMLElement): void {
  for (const c of ["tl", "tr", "bl", "br"]) el(panel, `corner ${c}`);
}

/** Drifting parallax grid + scanlines + vignette. Returns a tick updater for the slow drift. */
function atmosphere(): Updater {
  const a = el(root, "atmo");
  el(a, "atmo-glow");
  const d1 = el(a, "atmo-dots");
  const d2 = el(a, "atmo-dots2");
  el(a, "atmo-scan");
  el(a, "atmo-vign");
  return (p) => {
    d1.style.transform = `translate(${-p * 2.2}cqh, ${p * 0.8}cqh)`;
    d2.style.transform = `translate(${p * 1.6}cqh, ${-p * 0.6}cqh)`;
  };
}

function styleCompetitor(e: HTMLElement, name: string | null, color: number, s: { isWinner: boolean; isLoser: boolean; champ?: boolean }): void {
  setVar(e, "--c", cssHex(color));
  const state = s.champ ? "champ" : s.isWinner ? "win" : s.isLoser ? "lose" : name ? "" : "tbd";
  e.className = `bx ${state}`.trim();
  const span = document.createElement("span");
  span.className = "nm";
  span.textContent = name ?? "—";
  e.appendChild(span);
}

function drawBracket(state: BracketState, region: Region, connectors: boolean): Map<string, HTMLElement> {
  const boxes = new Map<string, HTMLElement>();
  if (connectors) drawConnectors(region, boxes);

  const draw = (round: Round, m: number, side: 0 | 1, name: string | null, winnerTeam: 0 | 1 | null) => {
    const r = competitorRect(round, m, side, region);
    const e = el(root, "bx");
    rect(e, r);
    e.style.fontSize = px(Math.min(r.h * 0.46, region.h * 0.02));
    styleCompetitor(e, name, slotColor(side), { isWinner: winnerTeam === side, isLoser: winnerTeam !== null && winnerTeam !== side });
    boxes.set(key(round, m, side), e);
  };
  state.ro16.forEach((mm, m) => {
    draw("ro16", m, 0, mm.top, mm.winnerTeam);
    draw("ro16", m, 1, mm.bot, mm.winnerTeam);
  });
  state.qf.forEach((mm, m) => {
    draw("qf", m, 0, mm.top, mm.winnerTeam);
    draw("qf", m, 1, mm.bot, mm.winnerTeam);
  });
  state.sf.forEach((mm, m) => {
    draw("sf", m, 0, mm.top, mm.winnerTeam);
    draw("sf", m, 1, mm.bot, mm.winnerTeam);
  });
  draw("final", 0, 0, state.final.top, state.final.winnerTeam);
  draw("final", 0, 1, state.final.bot, state.final.winnerTeam);

  const champ = el(root, "bx");
  rect(champ, championRect(region));
  champ.style.fontSize = px(Math.min(championRect(region).h * 0.46, region.h * 0.024));
  styleCompetitor(champ, state.champion, PODIUM_COLORS.gold, { isWinner: false, isLoser: false, champ: state.champion !== null });
  boxes.set("champion", champ);
  return boxes;
}

const ROUND_SEQ: Round[] = ["ro16", "qf", "sf", "final"];

/** Elbow connectors from each match's pair to the next round's slot (and final -> champion). */
function drawConnectors(region: Region, _boxes: Map<string, HTMLElement>): void {
  const line = (x: number, y: number, w: number, h: number) => {
    const e = el(root, "conn");
    rect(e, { x, y, w: Math.max(1, w), h: Math.max(1, h) });
  };
  const center = (r: Rect) => ({ x: r.x + r.w, y: r.y + r.h / 2 });
  for (let c = 0; c < ROUND_SEQ.length - 1; c++) {
    const a = ROUND_SEQ[c]!;
    const b = ROUND_SEQ[c + 1]!;
    const pairs = c === 0 ? 8 : c === 1 ? 4 : 2;
    for (let m = 0; m < pairs; m++) {
      const top = center(competitorRect(a, m, 0, region));
      const bot = center(competitorRect(a, m, 1, region));
      const next = competitorRect(b, Math.floor(m / 2), (m % 2) as 0 | 1, region);
      const busX = (top.x + next.x) / 2;
      line(top.x, top.y, busX - top.x, 1); // stub from top box
      line(bot.x, bot.y, busX - bot.x, 1); // stub from bot box
      line(busX, top.y, 1, bot.y - top.y); // vertical bus
      line(busX, (top.y + bot.y) / 2, next.x - busX, 1); // into next slot
    }
  }
}

function makeTitle(parent: HTMLElement, eyebrow: string, title: string, sub: string, scale = 1): Updater {
  const wrap = el(parent, "", { position: "absolute", left: "0", top: px(H * 0.07), width: px(W), textAlign: "center" });
  el(wrap, "eyebrow", { marginBottom: px(H * 0.018) }).textContent = eyebrow;
  const t = el(wrap, "title", { fontSize: `${7.2 * scale}cqh` });
  t.textContent = title;
  const r = el(wrap, "rule", { margin: `${1.6 * scale}cqh auto` });
  void r;
  const s = el(wrap, "", { font: `600 ${2.0 * scale}cqh "Archivo",sans-serif`, color: "rgba(232,236,248,0.7)", textTransform: "uppercase", letterSpacing: "0.06em" });
  s.textContent = sub;
  return (p) => {
    const a = easeOut(p * 3.2);
    wrap.style.opacity = String(a);
    wrap.style.transform = `translateY(${px(lerp(-H * 0.02, 0, a))})`;
  };
}

function buildIntro(p: IntroPayload): void {
  const drift = atmosphere();
  // Header: logo, brand eyebrow, harness-decided title, rule, entrants subtitle.
  const header = el(root, "", {
    position: "absolute", left: "0", top: px(H * 0.045), width: px(W),
    display: "flex", flexDirection: "column", alignItems: "center", gap: px(H * 0.014),
  });
  if (p.logo) {
    const img = document.createElement("img");
    img.className = "intro-logo";
    img.src = p.logo;
    header.appendChild(img);
  }
  el(header, "eyebrow", { fontSize: "1.7cqh" }).textContent = p.eyebrow;
  el(header, "title", { fontSize: "8cqh" }).textContent = p.title;
  el(header, "rule");
  el(header, "", {
    font: `600 2cqh "Archivo", sans-serif`, color: "rgba(232,236,248,0.72)",
    textTransform: "uppercase", letterSpacing: "0.06em",
  }).textContent = `${p.entrants.length} powers · single elimination`;

  const boxes = drawBracket(p.bracket, { x: 0, y: H * 0.4, w: W, h: H * 0.56 }, true);
  const els = [...boxes.values()];
  updaters.push((prog) => {
    drift(prog);
    const a = easeOut(prog * 3);
    header.style.opacity = String(a);
    header.style.transform = `translateY(${px(lerp(-H * 0.02, 0, a))})`;
    els.forEach((e, i) => {
      const stagger = 0.25 + (i / els.length) * 0.5;
      e.style.opacity = String(easeOut((prog - stagger) * 3));
    });
  });
}

function buildBeat(p: BeatPayload): void {
  const drift = atmosphere();
  const boxes = drawBracket(p.bracket, { x: 0, y: H * 0.2, w: W, h: H * 0.78 }, true);
  const fade = makeTitle(root, p.title, p.subtitle, "");

  let reveal: Updater | null = null;
  if (p.reveal) {
    const { round, matchIndex } = p.reveal;
    const wt = matchWinnerTeam(p.bracket, round, matchIndex);
    if (wt !== null) {
      const src = boxes.get(key(round, matchIndex, wt));
      const dst = boxes.get(destKey(round, matchIndex));
      const color = cssHex(slotColor(wt));
      if (dst) dst.style.opacity = "0";
      reveal = (prog) => {
        const pulse = Math.sin(clamp01(prog) * Math.PI);
        if (src) {
          src.style.boxShadow = `0 0 ${2.4 * (0.4 + pulse)}cqh -0.4cqh ${color}`;
          src.style.transform = `scale(${1 + 0.05 * pulse})`;
        }
        if (dst) {
          const a = easeOut(clamp01((prog - 0.2) * 1.8));
          dst.style.opacity = String(a);
          dst.style.transform = `translateX(${px(lerp(-W * 0.01, 0, a))})`;
        }
      };
    }
  }
  updaters.push((prog) => {
    drift(prog);
    fade(prog);
    reveal?.(prog);
  });
}

function buildPodium(p: PodiumPayload): void {
  const drift = atmosphere();
  const fade = makeTitle(root, "Cellstorm Championship", "Podium", `${p.champion} is your champion`);
  const spots = [
    { name: p.runnerUp, place: 2, color: PODIUM_COLORS.silver, cx: 0.28, hFrac: 0.34, delay: 0.14 },
    { name: p.champion, place: 1, color: PODIUM_COLORS.gold, cx: 0.5, hFrac: 0.48, delay: 0.0 },
    ...(p.third ? [{ name: p.third, place: 3, color: PODIUM_COLORS.bronze, cx: 0.72, hFrac: 0.26, delay: 0.24 }] : []),
  ];
  const floorY = H * 0.92;
  for (const s of spots) {
    const barW = W * 0.17;
    const x = W * s.cx - barW / 2;
    const fullH = H * s.hFrac;
    const hex = cssHex(s.color);
    const ped = el(root, "ped");
    setVar(ped, "--c", hex);
    ped.style.left = px(x);
    ped.style.width = px(barW);
    ped.style.bottom = px(H - floorY);
    const rank = el(ped, "ped-rank", { fontSize: "5.4cqh" });
    rank.textContent = String(s.place);
    const medal = el(root, "ped-medal", { left: px(x + barW / 2 - H * 0.04), width: px(H * 0.08), height: px(H * 0.08) });
    setVar(medal, "--c", hex);
    const name = el(root, "ped-name", { left: px(x - barW * 0.15), width: px(barW * 1.3), fontSize: "3.4cqh" });
    name.textContent = s.name;
    updaters.push((prog) => {
      const a = easeOut(clamp01((prog - s.delay) * 1.7));
      const h = fullH * a;
      ped.style.height = px(h);
      const topY = floorY - h;
      medal.style.top = px(topY - H * 0.12);
      medal.style.opacity = String(a);
      name.style.top = px(topY - H * 0.055);
      name.style.opacity = String(a);
      if (s.place === 1) {
        const pulse = Math.sin(clamp01(prog) * Math.PI);
        ped.style.boxShadow = `0 0 ${4 + 3 * pulse}cqh -1cqh ${hex}`;
      }
    });
  }
  updaters.push((prog) => {
    drift(prog);
    fade(prog);
  });
}

/** Static broadcast frame for a match: brand strip, left matchup panel (with seed ID), right
 *  mini-bracket, and a glowing bezel around the centered battle box. */
function buildMatchFrame(p: MatchFramePayload): void {
  isStatic = true;
  atmosphere();
  const L = frameLayout({ width: W, height: H, renderWidth: W, renderHeight: H });

  // Brand strip (top).
  const brand = el(root, "brand", { left: "0", top: px(L.title.h * 0.32), width: px(W) });
  el(brand, "brand-mark");
  el(brand, "eyebrow", { fontSize: "1.7cqh" }).textContent = "Cellstorm Championship";
  const tt = el(root, "title", { position: "absolute", left: "0", top: px(L.title.h * 0.5), width: px(W), textAlign: "center", fontSize: "3.6cqh" });
  tt.textContent = p.title;

  // Bezel + team-colored edges around the battle box.
  const bezel = el(root, "bezel");
  rect(bezel, L.battle);
  cornerBrackets(bezel);
  const topEdge = el(bezel, "bezel-edge", { top: "-0.2cqh" });
  setVar(topEdge, "--c", cssHex(slotColor(0)));
  const botEdge = el(bezel, "bezel-edge", { bottom: "-0.2cqh" });
  setVar(botEdge, "--c", cssHex(slotColor(1)));

  drawMatchupPanel(L.leftPanel, p);

  // Right panel: mini-bracket.
  const right = el(root, "panel accent");
  setVar(right, "--c", cssHex(0x22d3ee));
  rect(right, L.rightPanel);
  cornerBrackets(right);
  el(right, "panel-label eyebrow", { fontSize: "1.5cqh" }).textContent = "Bracket";
  drawBracket(p.bracket, { x: L.rightPanel.x, y: L.rightPanel.y + H * 0.04, w: L.rightPanel.w, h: L.rightPanel.h - H * 0.06 }, false);
}

function drawMatchupPanel(r: Rect, p: MatchFramePayload): void {
  const panel = el(root, "panel accent");
  setVar(panel, "--c", cssHex(slotColor(0)));
  rect(panel, r);
  cornerBrackets(panel);
  el(panel, "panel-label eyebrow", { fontSize: "1.5cqh" }).textContent = p.score ? "The Final" : "Matchup";

  const rowH = r.h * 0.2;
  const startY = r.y + r.h * 0.13;
  const comp = (name: string, desc: string, color: number, idx: number) => {
    const e = el(root, "comp");
    setVar(e, "--c", cssHex(color));
    e.style.left = px(r.x + r.w * 0.06);
    e.style.top = px(startY + idx * (rowH * 1.7));
    e.style.width = px(r.w * 0.88);
    e.style.height = px(rowH);
    const dot = el(e, "comp-dot");
    dot.style.width = px(rowH * 0.22);
    dot.style.height = px(rowH * 0.22);
    const text = el(e, "comp-text");
    el(text, "comp-name", { fontSize: px(rowH * 0.32) }).textContent = name;
    el(text, "comp-desc", { fontSize: px(rowH * 0.24) }).textContent = desc;
  };
  comp(p.top, p.topDesc, slotColor(0), 0);
  el(root, "vs", { left: px(r.x), top: px(startY + rowH * 1.18), width: px(r.w), fontSize: "2.8cqh" }).textContent = "VS";
  comp(p.bot, p.botDesc, slotColor(1), 1);

  if (p.score) {
    const sc = el(root, "", {
      position: "absolute", left: px(r.x), top: px(startY + rowH * 3.4), width: px(r.w), textAlign: "center",
      font: `400 7cqh var(--display)`, color: "#fff", textShadow: "0 0.3cqh 1.6cqh rgba(0,0,0,0.6)",
    });
    sc.className = "tnum";
    sc.textContent = `${p.score.top} – ${p.score.bot}`;
  }

  // Telemetry seed ID at the bottom.
  const id = el(root, "mono", {
    position: "absolute", left: px(r.x), top: px(r.y + r.h - H * 0.05), width: px(r.w), textAlign: "center",
    fontSize: "1.7cqh", color: "var(--faint)",
  });
  id.textContent = `ID: ${String(p.seed).padStart(7, "0")}`;
}

function destKey(round: Round, m: number): string {
  if (round === "ro16") return key("qf", Math.floor(m / 2), (m % 2) as 0 | 1);
  if (round === "qf") return key("sf", Math.floor(m / 2), (m % 2) as 0 | 1);
  if (round === "sf") return key("final", 0, (m % 2) as 0 | 1);
  return "champion";
}

function matchWinnerTeam(state: BracketState, round: Round, m: number): 0 | 1 | null {
  if (round === "ro16") return state.ro16[m]?.winnerTeam ?? null;
  if (round === "qf") return state.qf[m]?.winnerTeam ?? null;
  if (round === "sf") return state.sf[m]?.winnerTeam ?? null;
  return state.final.winnerTeam;
}

window.__scene = {
  init(args: InitArgs): void {
    W = args.width;
    H = args.height;
    TOTAL = Math.max(1, args.totalFrames);
    ensureFonts();
    ensureStyle();
    document.body.style.width = px(W);
    document.body.style.height = px(H);
    root = document.getElementById("scene") as HTMLElement;
    root.className = "scene";
    root.style.width = px(W);
    root.style.height = px(H);

    const p = args.payload;
    if (p.kind === "intro") buildIntro(p);
    else if (p.kind === "beat") buildBeat(p);
    else if (p.kind === "podium") buildPodium(p);
    else buildMatchFrame(p);
  },

  drawFrame(tick: number): void {
    if (isStatic) {
      for (const u of updaters) u(1);
      return;
    }
    const p = TOTAL <= 1 ? 1 : tick / (TOTAL - 1);
    const fin = 0.05;
    const fout = 0.93;
    const alpha = p < fin ? easeOut(p / fin) : p > fout ? easeOut((1 - p) / (1 - fout)) : 1;
    root.style.opacity = String(alpha);
    for (const u of updaters) u(p);
  },
};
