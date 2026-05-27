import { GRID_SIZE } from "./world";
const SR2 = 2500;
/** Run the perception scan + state selection for one cell. Caller gates on aiPhase. */
export function decide(w, c) {
    const p = w.teamPowers[c.team];
    const gx = Math.floor(c.x / GRID_SIZE), gy = Math.floor(c.y / GRID_SIZE);
    let allyCount = 0, enemyCount = 0;
    let acx = 0, acy = 0, avx = 0, avy = 0;
    let bestTX = 0, bestTY = 0, bestScore = -1;
    for (let dgy = -3; dgy <= 3; dgy++) {
        for (let dgx = -3; dgx <= 3; dgx++) {
            const ngx = gx + dgx, ngy = gy + dgy;
            if (ngx < 0 || ngx >= w.gw || ngy < 0 || ngy >= w.gh)
                continue;
            const list = w.grid[ngy * w.gw + ngx];
            for (const idx of list) {
                const o = w.cells[idx];
                if (!o.alive || o === c)
                    continue;
                const dx = o.x - c.x, dy = o.y - c.y;
                const d2 = dx * dx + dy * dy;
                if (d2 > SR2)
                    continue;
                if (o.team === c.team) {
                    allyCount++;
                    acx += o.x;
                    acy += o.y;
                    avx += o.vx;
                    avy += o.vy;
                }
                else {
                    enemyCount++;
                    const score = 3500 / (d2 + 60) + (1 - o.hp / o.maxHp) * 5;
                    if (score > bestScore) {
                        bestScore = score;
                        bestTX = o.x;
                        bestTY = o.y;
                    }
                }
            }
        }
    }
    if (allyCount > 0) {
        acx /= allyCount;
        acy /= allyCount;
        avx /= allyCount;
        avy /= allyCount;
    }
    const hpFrac = c.hp / c.maxHp;
    let state = enemyCount > 0 ? "engage" : "hunt";
    if (p.aggro)
        state = "engage";
    else if (p.healer && hpFrac < 0.95 && enemyCount > 0)
        state = "engage";
    else if (!p.hold && hpFrac < 0.28 && allyCount > 0)
        state = "retreat";
    else if (!p.hold && !p.aggro && enemyCount > allyCount + 2 && allyCount > 1)
        state = "regroup";
    c.state = state;
    c.tx = bestScore > -1 ? bestTX : null;
    c.ty = bestScore > -1 ? bestTY : null;
    c.acx = allyCount > 0 ? acx : null;
    c.acy = allyCount > 0 ? acy : null;
    c.avx = avx;
    c.avy = avy;
}
