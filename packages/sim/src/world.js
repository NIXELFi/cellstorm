import { makePrng, randInt } from "./prng";
import { powerByName } from "./powers";
export const GRID_SIZE = 14;
export const BASE_HP = 45;
export const BASE_RADIUS = 3;
export function makeCell(w, team, x, y) {
    const p = w.teamPowers[team];
    const hp = BASE_HP * (p.hp ?? 1);
    return {
        id: w.nextId++, team, x, y,
        vx: (w.prng() - 0.5) * 0.5, vy: (w.prng() - 0.5) * 0.5,
        hp, maxHp: hp, radius: BASE_RADIUS * (p.radius ?? 1),
        alive: true, state: "engage", aiPhase: randInt(w.prng, 8),
        tx: null, ty: null, acx: null, acy: null, avx: 0, avy: 0,
        stunT: 0, plagueT: 0,
        cdShoot: randInt(w.prng, 30), cdCharge: randInt(w.prng, 40), cdRevive: randInt(w.prng, 60),
        dash: 0,
    };
}
export function createWorld(cfg) {
    const prng = makePrng(cfg.seed);
    const { width: W, height: H } = cfg.arena;
    const gw = Math.ceil(W / GRID_SIZE), gh = Math.ceil(H / GRID_SIZE);
    const grid = Array.from({ length: gw * gh }, () => []);
    const w = {
        cfg, prng, teamPowers: cfg.powers.map(powerByName),
        cells: [], projectiles: [], corpses: [], pending: [],
        grid, gw, gh, frame: 0, nextId: 0, winner: -2, lastChangeFrame: 0,
    };
    const perTeam = Math.round(cfg.totalCells / cfg.teamCount);
    for (let t = 0; t < cfg.teamCount; t++) {
        const angle = (t / cfg.teamCount) * Math.PI * 2 - Math.PI / 2;
        const r = Math.min(W, H) * 0.34;
        const tcx = W / 2 + Math.cos(angle) * r;
        const tcy = H / 2 + Math.sin(angle) * r;
        for (let i = 0; i < perTeam; i++) {
            const a = w.prng() * Math.PI * 2;
            const rr = Math.sqrt(w.prng()) * 26;
            w.cells.push(makeCell(w, t, tcx + Math.cos(a) * rr, tcy + Math.sin(a) * rr));
        }
    }
    return w;
}
export function rebuildGrid(w) {
    for (const cell of w.grid)
        cell.length = 0;
    for (let i = 0; i < w.cells.length; i++) {
        const c = w.cells[i];
        if (!c.alive)
            continue;
        let gx = Math.floor(c.x / GRID_SIZE), gy = Math.floor(c.y / GRID_SIZE);
        gx = gx < 0 ? 0 : gx >= w.gw ? w.gw - 1 : gx;
        gy = gy < 0 ? 0 : gy >= w.gh ? w.gh - 1 : gy;
        w.grid[gy * w.gw + gx].push(i);
    }
}
export function teamCounts(w) {
    const counts = new Array(w.cfg.teamCount).fill(0);
    for (const c of w.cells)
        if (c.alive)
            counts[c.team]++;
    return counts;
}
