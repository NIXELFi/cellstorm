import { describe, test, expect } from "vitest";
import { findClashes, CLASH_TUNING, type ClashCell, type FindClashesOpts } from "../src/clash";

// Default detection opts mirroring the tuning defaults (gridCell big enough that close pairs share
// or neighbor a bucket).
const OPTS: FindClashesOpts = {
  radiusFactor: CLASH_TUNING.radiusFactor,
  gridCell: CLASH_TUNING.gridCell,
  maxPerFrame: CLASH_TUNING.maxPerFrame,
};

function cell(x: number, y: number, team: number, radius = 3, alive = true): ClashCell {
  return { x, y, team, radius, alive };
}

describe("findClashes", () => {
  test("two opposing close cells -> 1 clash at their midpoint", () => {
    const cells = [cell(10, 10, 0), cell(15, 10, 1)]; // dist 5 < (3+3)*1.15 = 6.9
    const out = findClashes(cells, OPTS);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ x: 12.5, y: 10 });
  });

  test("same-team close cells -> 0", () => {
    const cells = [cell(10, 10, 0), cell(15, 10, 0)];
    expect(findClashes(cells, OPTS)).toHaveLength(0);
  });

  test("far apart opposing cells -> 0", () => {
    const cells = [cell(10, 10, 0), cell(100, 100, 1)];
    expect(findClashes(cells, OPTS)).toHaveLength(0);
  });

  test("just outside contact reach -> 0", () => {
    // reach = (3+3)*1.15 = 6.9; place exactly 7 apart -> no clash.
    const cells = [cell(0, 0, 0), cell(7, 0, 1)];
    expect(findClashes(cells, OPTS)).toHaveLength(0);
  });

  test("dead cells are ignored", () => {
    const cells = [cell(10, 10, 0, 3, false), cell(13, 10, 1)];
    expect(findClashes(cells, OPTS)).toHaveLength(0);
    const cells2 = [cell(10, 10, 0), cell(13, 10, 1, 3, false)];
    expect(findClashes(cells2, OPTS)).toHaveLength(0);
  });

  test("result length is capped at maxPerFrame", () => {
    // Build many clashing opposing pairs spread out so they don't over-cluster, then cap at 5.
    const cells: ClashCell[] = [];
    for (let i = 0; i < 40; i++) {
      const x = i * 50; // far apart pairs, each pair internally close
      cells.push(cell(x, 0, 0));
      cells.push(cell(x + 4, 0, 1)); // dist 4 < 6.9 -> clash
    }
    const out = findClashes(cells, { ...OPTS, maxPerFrame: 5 });
    expect(out).toHaveLength(5);
  });

  test("grid finds neighbors across bucket boundaries", () => {
    // gridCell=4: a cell just left of a boundary and one just right land in adjacent buckets, yet
    // are within contact reach -> must still be detected via the 8-neighbor scan.
    const opts: FindClashesOpts = { radiusFactor: 1.15, gridCell: 4, maxPerFrame: 14 };
    const cells = [cell(3.9, 0, 0), cell(4.1, 0, 1)]; // floor(3.9/4)=0, floor(4.1/4)=1; dist 0.2
    const out = findClashes(cells, opts);
    expect(out).toHaveLength(1);
    expect(out[0]!.x).toBeCloseTo(4.0, 6);
    expect(out[0]!.y).toBeCloseTo(0, 6);
  });

  test("each unordered pair is reported only once", () => {
    const cells = [cell(10, 10, 0), cell(11, 10, 1)];
    expect(findClashes(cells, OPTS)).toHaveLength(1);
  });

  test("empty input -> no clashes", () => {
    expect(findClashes([], OPTS)).toHaveLength(0);
  });
});
