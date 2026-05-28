// Power-balance measurement under the current (tuned) AI profile. Runs a 1v1 round-robin over all
// 20 powers (both spawn orderings to cancel position bias) and reports each power's overall win
// rate. ~50% = balanced; >>50% = overpowered; <<50% = weak. Run: node_modules/.bin/tsx balanceStudy.mts
import { runBattle, normalizeConfig, POWER_NAMES } from "@cellstorm/sim";

const SEEDS = 10;
const CELLS = 300; // reduced for speed; balance is relative

const names = [...POWER_NAMES];
const wins: Record<string, number> = {};
const games: Record<string, number> = {};
const stalemates: Record<string, number> = {};
let totalStale = 0, totalGames = 0;
for (const n of names) { wins[n] = 0; games[n] = 0; stalemates[n] = 0; }

for (let i = 0; i < names.length; i++) {
  for (let j = 0; j < names.length; j++) {
    if (i === j) continue;
    const a = names[i]!, b = names[j]!;
    for (let s = 0; s < SEEDS; s++) {
      const cfg = normalizeConfig({ seed: s, teamCount: 2, powers: [a, b], totalCells: CELLS });
      const { summary } = runBattle(cfg);
      games[a]!++; games[b]!++; totalGames++;
      if (summary.winner === 0) wins[a]!++;
      else if (summary.winner === 1) wins[b]!++;
      else { stalemates[a]!++; stalemates[b]!++; totalStale++; }
    }
  }
}

const rows = names
  .map((n) => ({ name: n, winPct: (100 * wins[n]!) / games[n]!, stalePct: (100 * stalemates[n]!) / games[n]! }))
  .sort((a, b) => b.winPct - a.winPct);

console.log(`\n=== 1v1 power balance under tuned AI — ${totalGames} games (${SEEDS} seeds x both orderings) ===`);
console.log(`overall stalemate rate: ${((100 * totalStale) / totalGames).toFixed(1)}%\n`);
console.log("power            win%   stale%");
for (const r of rows) {
  console.log(`${r.name.padEnd(14)} ${r.winPct.toFixed(1).padStart(5)}  ${r.stalePct.toFixed(1).padStart(5)}`);
}
