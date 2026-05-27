/**
 * Appends pending cells (splitter clones, necromancer revives), compacts dead
 * cells out of the array via swap-remove so hot loops only touch live cells,
 * and ages corpses out. Cell indices change here; the grid is rebuilt at the
 * start of the next step, so stale indices are never read.
 */
export function resolveSpawnsAndCompact(w) {
    for (let i = 0; i < w.pending.length; i++)
        w.cells.push(w.pending[i]);
    w.pending.length = 0;
    // Swap-remove dead cells.
    let n = w.cells.length;
    let i = 0;
    while (i < n) {
        const c = w.cells[i];
        if (c.alive) {
            i++;
            continue;
        }
        n--;
        w.cells[i] = w.cells[n];
        w.cells.pop();
    }
    for (let k = w.corpses.length - 1; k >= 0; k--) {
        const cp = w.corpses[k];
        cp.age++;
        if (cp.age > 300)
            w.corpses.splice(k, 1);
    }
}
