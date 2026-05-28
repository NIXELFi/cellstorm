// One-factor-at-a-time (OFAT) sensitivity study: vary each AI setting individually from the
// ORIGINAL baseline and measure how it moves each aspect of the fight — resolution, duration,
// in-window rate (15-40s), and the individual drama components (comeback, climax, close-finish,
// lead volatility, chaos) plus drama pass-rate / score.
// Run: node_modules/.bin/tsx sensitivity.mts
import { runBattle, normalizeConfig, POWER_NAMES, makePrng, shuffle, DEFAULT_AI } from "@cellstorm/sim";
import type { AiParams } from "@cellstorm/sim";
import { score, DEFAULT_PROFILE } from "@cellstorm/score";

const TEAM_COUNTS = [2, 3, 4, 5, 6];
const SEEDS_PER = 12;
const FPS = 60;
const WIN_MIN = 15, WIN_MAX = 40;

function randomPowers(teamCount: number, seed: number): string[] {
  return shuffle(makePrng(seed ^ 0x9e3779b9), [...POWER_NAMES]).slice(0, teamCount);
}

interface Stat {
  total: number; resolved: number; inWindow: number; ticks: number;
  passed: number; scoreSum: number;
  comp: { leadVolatility: number; comeback: number; climaxTiming: number; closeFinish: number; sustainedChaos: number };
}

function evaluate(ai: Partial<AiParams>): Stat {
  const s: Stat = {
    total: 0, resolved: 0, inWindow: 0, ticks: 0, passed: 0, scoreSum: 0,
    comp: { leadVolatility: 0, comeback: 0, climaxTiming: 0, closeFinish: 0, sustainedChaos: 0 },
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
      if (r.passed) {
        s.passed++; s.scoreSum += r.score;
        s.comp.leadVolatility += r.breakdown.leadVolatility ?? 0;
        s.comp.comeback += r.breakdown.comeback ?? 0;
        s.comp.climaxTiming += r.breakdown.climaxTiming ?? 0;
        s.comp.closeFinish += r.breakdown.closeFinish ?? 0;
        s.comp.sustainedChaos += r.breakdown.sustainedChaos ?? 0;
      }
    }
  }
  return s;
}

function row(label: string, s: Stat): string {
  const p = s.passed || 1;
  const f = (n: number) => n.toFixed(2);
  return [
    label.padEnd(18),
    `${((100 * s.resolved) / s.total).toFixed(0).padStart(3)}%`,
    `${((100 * s.inWindow) / s.total).toFixed(0).padStart(3)}%`,
    `${(s.ticks / s.total / FPS).toFixed(0).padStart(3)}s`,
    `${((100 * s.passed) / s.total).toFixed(0).padStart(3)}%`,
    f(s.passed ? s.scoreSum / s.passed : 0).padStart(5),
    "|",
    f(s.comp.leadVolatility / p).padStart(5),
    f(s.comp.comeback / p).padStart(5),
    f(s.comp.climaxTiming / p).padStart(5),
    f(s.comp.closeFinish / p).padStart(5),
    f(s.comp.sustainedChaos / p).padStart(5),
  ].join("  ");
}

const HEADER = `${"setting".padEnd(18)}  res  win  dur  pass  score  |  lead   come   clmx  close  chaos`;

// OFAT axes: each is a list of [label, override] applied alone on top of the original baseline.
const AXES: Array<[string, Array<[string, Partial<AiParams>]>]> = [
  ["BASELINE", [["(original)", {}]]],
  ["huntCenterBias", [["0.08", { huntCenterBias: 0.08 }], ["0.16", { huntCenterBias: 0.16 }], ["0.24", { huntCenterBias: 0.24 }]]],
  ["perception", [["64px/w5", { perceptionR2: 4096, scanWindow: 5 }], ["96px/w7", { perceptionR2: 9216, scanWindow: 7 }]]],
  ["engageForce", [["0.30/0.42", { engageForce: 0.3, aggroEngageForce: 0.42 }], ["0.40/0.55", { engageForce: 0.4, aggroEngageForce: 0.55 }]]],
  ["retreatHpFrac", [["0.15", { retreatHpFrac: 0.15 }], ["0.00(off)", { retreatHpFrac: 0 }]]],
  ["flockWeight", [["0.00", { flockWeight: 0 }], ["0.12", { flockWeight: 0.12 }]]],
  ["damageScale", [["0.50", { damageScale: 0.5 }], ["0.30", { damageScale: 0.3 }], ["0.20", { damageScale: 0.2 }]]],
];

console.log(`\n=== OFAT sensitivity: ${TEAM_COUNTS.length} x ${SEEDS_PER} = ${TEAM_COUNTS.length * SEEDS_PER} battles/level ===`);
console.log(`(window ${WIN_MIN}-${WIN_MAX}s; drama components averaged over PASSED battles)\n`);
console.log(HEADER);
for (const [axis, levels] of AXES) {
  console.log(`-- ${axis} --`);
  for (const [label, ai] of levels) console.log(row(label, evaluate(ai)));
}
