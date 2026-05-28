// Tune damageScale to center the VIDEO-LENGTH distribution near ~25s (floor 15, cap 40) while
// keeping resolution + drama yield high. Reports the full duration distribution per damageScale.
// Run: node_modules/.bin/tsx durationStudy.mts
import { runBattle, normalizeConfig, POWER_NAMES, makePrng, shuffle } from "@cellstorm/sim";
import { score, DEFAULT_PROFILE } from "@cellstorm/score";

const TEAM_COUNTS = [3, 4, 5];
const SEEDS = 24;
const FPS = 60;

function randomPowers(tc: number, seed: number): string[] {
  return shuffle(makePrng(seed ^ 0x9e3779b9), [...POWER_NAMES]).slice(0, tc);
}

const SCALES = [0.4, 0.32, 0.26, 0.21, 0.17, 0.13];

interface Row { ds: number; med: number; p25: number; p75: number; inWin: number; res: number; yield: number; }

function evaluate(ds: number): Row {
  const secs: number[] = [];
  let resolved = 0, inWin = 0, scoreAll = 0, total = 0;
  for (const tc of TEAM_COUNTS) {
    for (let seed = 0; seed < SEEDS; seed++) {
      const cfg = normalizeConfig({ seed, teamCount: tc, powers: randomPowers(tc, seed), ai: { damageScale: ds } });
      const { summary, log } = runBattle(cfg);
      total++;
      const vsec = summary.totalTicks / FPS; // video length (fight + outro)
      secs.push(vsec);
      if (summary.resolved) resolved++;
      if (vsec >= 15 && vsec <= 40) inWin++;
      scoreAll += score(log, DEFAULT_PROFILE).score;
    }
  }
  secs.sort((a, b) => a - b);
  const q = (p: number) => secs[Math.min(secs.length - 1, Math.floor(p * secs.length))]!;
  return {
    ds, med: q(0.5), p25: q(0.25), p75: q(0.75),
    inWin: (100 * inWin) / total, res: (100 * resolved) / total, yield: scoreAll / total,
  };
}

console.log(`\n=== damageScale -> video-length distribution — ${TEAM_COUNTS.length}x${SEEDS}=${TEAM_COUNTS.length * SEEDS} battles/level ===`);
console.log("damageScale  p25    median  p75    in15-40%  resolve%  yield");
for (const ds of SCALES) {
  const r = evaluate(ds);
  console.log(
    `${r.ds.toFixed(2).padStart(8)}    ${r.p25.toFixed(1).padStart(4)}s  ${r.med.toFixed(1).padStart(4)}s  ${r.p75.toFixed(1).padStart(4)}s   ${r.inWin.toFixed(0).padStart(5)}%    ${r.res.toFixed(0).padStart(5)}%   ${r.yield.toFixed(3)}`,
  );
}
