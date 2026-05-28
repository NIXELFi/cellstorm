// AI study 2: a strongly-resolving aggression base, sweeping damageScale to land battles in the
// 30-60s window. Optimize for inWindow% (resolves within window) while keeping resolved% high.
// Run: node_modules/.bin/tsx aiExp.mts
import { runBattle, normalizeConfig, POWER_NAMES, makePrng, shuffle, DEFAULT_AI } from "@cellstorm/sim";
import type { AiParams } from "@cellstorm/sim";
import { score, DEFAULT_PROFILE } from "@cellstorm/score";

const TEAM_COUNTS = [2, 3, 4, 5, 6];
const SEEDS_PER = 14;
const FPS = 60;
const WIN_MIN = 15, WIN_MAX = 40; // shorts-tuned duration target (floor 15s, cap 40s, ~25s sweet spot)

function randomPowers(teamCount: number, seed: number): string[] {
  return shuffle(makePrng(seed ^ 0x9e3779b9), [...POWER_NAMES]).slice(0, teamCount);
}

// Strongly-resolving aggression base from study 1 (96% resolve, but ~4s at damageScale 1).
const AGG: Partial<AiParams> = {
  huntCenterBias: 0.18, perceptionR2: 4096, scanWindow: 5,
  engageForce: 0.3, aggroEngageForce: 0.42, retreatHpFrac: 0.15,
};
const MILD: Partial<AiParams> = { huntCenterBias: 0.12, retreatHpFrac: 0.2 };

type Profile = { name: string; ai: Partial<AiParams> };
const PROFILES: Profile[] = [
  { name: "baseline", ai: {} },
  { name: "AGG ds0.7", ai: { ...AGG, damageScale: 0.7 } },
  { name: "AGG ds0.5", ai: { ...AGG, damageScale: 0.5 } },
  { name: "AGG ds0.35", ai: { ...AGG, damageScale: 0.35 } },
  { name: "AGG ds0.28", ai: { ...AGG, damageScale: 0.28 } },
  { name: "AGG ds0.22", ai: { ...AGG, damageScale: 0.22 } },
  { name: "AGG ds0.18", ai: { ...AGG, damageScale: 0.18 } },
  { name: "AGG ds0.14", ai: { ...AGG, damageScale: 0.14 } },
  { name: "MILD ds0.35", ai: { ...MILD, damageScale: 0.35 } },
  { name: "MILD ds0.25", ai: { ...MILD, damageScale: 0.25 } },
];

interface Stat { resolved: number; total: number; inWindow: number; ticks: number; passed: number; scoreSum: number; bestScore: number }

function evaluate(ai: Partial<AiParams>): Stat {
  const s: Stat = { resolved: 0, total: 0, inWindow: 0, ticks: 0, passed: 0, scoreSum: 0, bestScore: 0 };
  for (const tc of TEAM_COUNTS) {
    for (let seed = 0; seed < SEEDS_PER; seed++) {
      const cfg = normalizeConfig({ seed, teamCount: tc, powers: randomPowers(tc, seed), ai: { ...DEFAULT_AI, ...ai } });
      const { summary, log } = runBattle(cfg);
      s.total++; s.ticks += summary.durationTicks;
      if (summary.resolved) {
        s.resolved++;
        const sec = summary.durationTicks / FPS;
        if (sec >= WIN_MIN && sec <= WIN_MAX) s.inWindow++;
      }
      // Drama score under the default scoring profile (the real "good video" metric).
      const report = score(log, DEFAULT_PROFILE);
      if (report.passed) { s.passed++; s.scoreSum += report.score; }
      if (report.score > s.bestScore) s.bestScore = report.score;
    }
  }
  return s;
}

const rows = PROFILES.map((p) => {
  const s = evaluate(p.ai);
  return {
    name: p.name,
    resolvedPct: (100 * s.resolved) / s.total,
    inWindowPct: (100 * s.inWindow) / s.total,
    avgSec: s.ticks / s.total / FPS,
    passedPct: (100 * s.passed) / s.total,
    avgScore: s.passed > 0 ? s.scoreSum / s.passed : 0,
    bestScore: s.bestScore,
  };
});

// Rank by what matters for shipping: how many battles pass the drama gates.
rows.sort((a, b) => b.passedPct - a.passedPct);
console.log(`\n=== AI study 2: ${TEAM_COUNTS.length} x ${SEEDS_PER} = ${TEAM_COUNTS.length * SEEDS_PER} battles/profile ===`);
console.log("profile          resolved%  inWin%  avgSec  | drama: passed%  avgScore  best");
for (const r of rows) {
  console.log(
    `${r.name.padEnd(16)} ${r.resolvedPct.toFixed(1).padStart(7)}  ${r.inWindowPct.toFixed(1).padStart(5)}  ${r.avgSec.toFixed(1).padStart(6)}  | ${r.passedPct.toFixed(1).padStart(7)}  ${r.avgScore.toFixed(2).padStart(8)}  ${r.bestScore.toFixed(2).padStart(5)}`,
  );
}
