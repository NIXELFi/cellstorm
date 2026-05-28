// Validate the real goal: do multi-team battles now show lead changes & comebacks (vs the dead
// ~0.01 lead-volatility baseline)? Measures drama components over random multi-team battles under
// the current (tuned AI + balanced powers). Run: node_modules/.bin/tsx leadCheck.mts
import { runBattle, normalizeConfig, POWER_NAMES, makePrng, shuffle } from "@cellstorm/sim";
import { score, DEFAULT_PROFILE } from "@cellstorm/score";

const TEAM_COUNTS = [3, 4, 5, 6];
const SEEDS = 30;

function randomPowers(tc: number, seed: number): string[] {
  return shuffle(makePrng(seed ^ 0x9e3779b9), [...POWER_NAMES]).slice(0, tc);
}

let total = 0, passed = 0, scoreAll = 0, leadEvents = 0;
const c = { lead: 0, come: 0, clmx: 0, close: 0, chaos: 0 };
for (const tc of TEAM_COUNTS) {
  for (let s = 0; s < SEEDS; s++) {
    const cfg = normalizeConfig({ seed: s, teamCount: tc, powers: randomPowers(tc, s) });
    const { log } = runBattle(cfg);
    total++;
    leadEvents += log.events.filter((e) => e.type === "leadChange").length;
    const r = score(log, DEFAULT_PROFILE);
    scoreAll += r.score;
    if (r.passed) {
      passed++;
      c.lead += r.breakdown.leadVolatility ?? 0;
      c.come += r.breakdown.comeback ?? 0;
      c.clmx += r.breakdown.climaxTiming ?? 0;
      c.close += r.breakdown.closeFinish ?? 0;
      c.chaos += r.breakdown.sustainedChaos ?? 0;
    }
  }
}
const p = passed || 1;
console.log(`\n=== multi-team drama check — ${total} battles (current tuned AI + balanced powers) ===`);
console.log(`pass% (15-40s, clear winner, drama): ${((100 * passed) / total).toFixed(1)}%`);
console.log(`drama yield (mean score all):        ${(scoreAll / total).toFixed(3)}`);
console.log(`avg lead changes per battle:         ${(leadEvents / total).toFixed(2)}`);
console.log(`\ndrama components (avg over passed):`);
console.log(`  leadVolatility: ${(c.lead / p).toFixed(3)}   (baseline was ~0.01)`);
console.log(`  comeback:       ${(c.come / p).toFixed(3)}`);
console.log(`  climaxTiming:   ${(c.clmx / p).toFixed(3)}`);
console.log(`  closeFinish:    ${(c.close / p).toFixed(3)}`);
console.log(`  sustainedChaos: ${(c.chaos / p).toFixed(3)}`);
