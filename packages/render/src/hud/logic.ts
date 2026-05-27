// Pure HUD logic — NO Pixi imports. Everything here is unit-tested; the Pixi element classes
// (counters/leaderboard/intro/winner) are thin shells that call these functions to decide
// what to draw. Keeping the math here lets us prove HUD behavior without WebGL/DOM.

const FPS = 60;

/**
 * Ease a displayed counter toward its target by a fixed fraction per frame. Mirrors the
 * "animated team counters" requirement: the number visibly slides instead of snapping.
 * Snaps to target when within 0.5 to avoid asymptotic drift.
 */
export function easeCounter(current: number, target: number, rate = 0.25): number {
  const next = current + (target - current) * rate;
  return Math.abs(target - next) < 0.5 ? target : next;
}

export interface RankedTeam {
  team: number;
  count: number;
}

/**
 * Leaderboard ordering: descending by count, ties broken by ascending team id so the order is
 * stable/deterministic. Returns ranked team ids + counts; the element maps these to rows.
 */
export function leaderboardOrder(counts: number[]): RankedTeam[] {
  return counts
    .map((count, team) => ({ team, count }))
    .sort((a, b) => (b.count - a.count) || (a.team - b.team));
}

/** Index of the current front-runner (argmax of counts), -1 if all zero. Ties -> lowest id. */
export function leaderTeam(counts: number[]): number {
  let best = -1;
  let bestCount = 0;
  for (let t = 0; t < counts.length; t++) {
    const c = counts[t]!;
    if (c > bestCount) {
      bestCount = c;
      best = t;
    }
  }
  return best;
}

/** Whether the intro hook is still on screen at this tick. */
export function introVisible(tick: number, introSeconds: number): boolean {
  return tick < introSeconds * FPS;
}

/**
 * Intro opacity: fully opaque for most of its window, then a quick fade-out over the final
 * ~25% of its duration. 0 once the intro window has fully elapsed.
 */
export function introAlpha(tick: number, introSeconds: number): number {
  const total = introSeconds * FPS;
  if (tick >= total) return 0;
  const fadeStart = total * 0.75;
  if (tick <= fadeStart) return 1;
  return 1 - (tick - fadeStart) / (total - fadeStart);
}

/**
 * Winner-reveal opacity: 0 while unresolved (winner < 0), then fades in over `fadeSeconds`
 * once a winner exists, tracked from the tick the reveal began.
 */
export function winnerAlpha(winner: number, ticksSinceReveal: number, fadeSeconds = 0.4): number {
  if (winner < 0) return 0;
  const total = fadeSeconds * FPS;
  if (total <= 0) return 1;
  return Math.min(1, ticksSinceReveal / total);
}

/** Default intro title derived from the matchup when no custom title is set. */
export function defaultIntroTitle(teamPowers: string[]): string {
  if (teamPowers.length === 0) return "Who survives?";
  if (teamPowers.length === 2) return `${teamPowers[0]} vs ${teamPowers[1]} — who wins?`;
  return `${teamPowers.join(" · ")} — who survives?`;
}
