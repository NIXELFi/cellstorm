// Final comparison: stock (original) vs the combined candidate profile and neighbors.
// Ranked by drama YIELD = mean drama score across ALL battles (gated/failed = 0), which balances
// "how many battles are shippable" with "how good they are". Run: node_modules/.bin/tsx finalCompare.mts
import { runBattle, normalizeConfig, POWER_NAMES, makePrng, shuffle, DEFAULT_AI } from "@cellstorm/sim";
import type { AiParams } from "@cellstorm/sim";
import { score, DEFAULT_PROFILE } from "@cellstorm/score";

const TEAM_COUNTS = [2, 3, 4, 5, 6];
const SEEDS_PER = 16;
const FPS = 60;
const WIN_MIN = 15, WIN_MAX = 40;

function randomPowers(teamCount: number, seed: number): string[] {
  return shuffle(makePrng(seed ^ 0x9e3779b9), [...POWER_NAMES]).slice(0, teamCount);
}

// Round 2: GENTLE resolution (wider perception so cells find each other) + a small hunt nudge for
// stragglers, NOT the full convergence stack — then damage tuning to sit avg duration near ~25s.
const P: Partial<AiParams> = { perceptionR2: 4096, scanWindow: 5 }; // 64px perception

// Round 3: best base from round 2 (P64 + retreatOff), sweeping damageScale DOWN to push the avg
// duration up into ~25s and fill the 15-40s window. Plus a small-hunt variant to mop up stalemates.
const RET: Partial<AiParams> = { ...P, retreatHpFrac: 0 };
type Profile = { name: string; ai: Partial<AiParams> };
const PROFILES: Profile[] = [
  { name: "STOCK (orig)", ai: {} },
  { name: "RET ds.6", ai: { ...RET, damageScale: 0.6 } },
  { name: "RET ds.5", ai: { ...RET, damageScale: 0.5 } },
  { name: "RET ds.45", ai: { ...RET, damageScale: 0.45 } },
  { name: "RET ds.4", ai: { ...RET, damageScale: 0.4 } },
  { name: "RET h.04 ds.5", ai: { ...RET, huntCenterBias: 0.04, damageScale: 0.5 } },
  { name: "RET h.04 ds.4", ai: { ...RET, huntCenterBias: 0.04, damageScale: 0.4 } },
  { name: "RET h.06 ds.45", ai: { ...RET, huntCenterBias: 0.06, damageScale: 0.45 } },
];

interface Stat {
  total: number; resolved: number; inWindow: number; ticks: number;
  passed: number; scoreSumAll: number; scoreSumPass: number;
  comp: { comeback: number; climaxTiming: number; closeFinish: number; sustainedChaos: number };
}

function evaluate(ai: Partial<AiParams>): Stat {
  const s: Stat = {
    total: 0, resolved: 0, inWindow: 0, ticks: 0, passed: 0, scoreSumAll: 0, scoreSumPass: 0,
    comp: { comeback: 0, climaxTiming: 0, closeFinish: 0, sustainedChaos: 0 },
  };
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
      const r = score(log, DEFAULT_PROFILE);
      s.scoreSumAll += r.score; // gated/failed contribute 0
      if (r.passed) {
        s.passed++; s.scoreSumPass += r.score;
        s.comp.comeback += r.breakdown.comeback ?? 0;
        s.comp.climaxTiming += r.breakdown.climaxTiming ?? 0;
        s.comp.closeFinish += r.breakdown.closeFinish ?? 0;
        s.comp.sustainedChaos += r.breakdown.sustainedChaos ?? 0;
      }
    }
  }
  return s;
}

const rows = PROFILES.map((p) => {
  const s = evaluate(p.ai);
  const pz = s.passed || 1;
  return {
    name: p.name,
    res: (100 * s.resolved) / s.total,
    win: (100 * s.inWindow) / s.total,
    dur: s.ticks / s.total / FPS,
    pass: (100 * s.passed) / s.total,
    yield: s.scoreSumAll / s.total,
    scorePass: s.passed ? s.scoreSumPass / s.passed : 0,
    come: s.comp.comeback / pz, clmx: s.comp.climaxTiming / pz,
    close: s.comp.closeFinish / pz, chaos: s.comp.sustainedChaos / pz,
  };
});
rows.sort((a, b) => b.yield - a.yield);

console.log(`\n=== FINAL: stock vs candidates — ${TEAM_COUNTS.length}x${SEEDS_PER}=${TEAM_COUNTS.length * SEEDS_PER} battles/profile (window ${WIN_MIN}-${WIN_MAX}s) ===`);
console.log("profile         res   win   dur   pass  YIELD  scoreP | come  clmx  close chaos");
for (const r of rows) {
  console.log(
    `${r.name.padEnd(15)} ${r.res.toFixed(0).padStart(3)}%  ${r.win.toFixed(0).padStart(3)}%  ${r.dur.toFixed(0).padStart(3)}s  ${r.pass.toFixed(0).padStart(3)}%  ${r.yield.toFixed(3).padStart(5)}  ${r.scorePass.toFixed(2).padStart(5)} | ${r.come.toFixed(2)}  ${r.clmx.toFixed(2)}  ${r.close.toFixed(2)}  ${r.chaos.toFixed(2)}`,
  );
}
