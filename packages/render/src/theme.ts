// Visual theme: palette + background, ported from the battle.html prototype as the
// editable baseline. Colors are PixiJS-style 0xRRGGBB numbers (the prototype used CSS
// hex strings: #ff5066 etc. -> 0xff5066). Pure data, no Pixi imports — safe to unit-test.

export interface TeamTheme {
  name: string;
  color: number;
}

export interface Theme {
  /** Arena fill (prototype canvas frame `#050008`). */
  background: number;
  /** Surrounding page background (prototype `body` `#08070d`). */
  pageBackground: number;
  /** Per-team palette; index === team id. */
  teams: TeamTheme[];
}

export const THEME: Theme = {
  background: 0x050008,
  pageBackground: 0x08070d,
  teams: [
    { name: "Red", color: 0xff5066 },
    { name: "Blue", color: 0x5099ff },
    { name: "Gold", color: 0xffcc40 },
    { name: "Green", color: 0x4ade80 },
    { name: "Purple", color: 0xc084fc },
    { name: "Cyan", color: 0x22d3ee },
  ],
};

/** Team color, clamped to the palette (wraps if more teams than palette entries). */
export function teamColor(theme: Theme, team: number): number {
  const t = theme.teams[team % theme.teams.length];
  return t ? t.color : 0xffffff;
}

/** Team display name, clamped to the palette. */
export function teamName(theme: Theme, team: number): string {
  const t = theme.teams[team % theme.teams.length];
  return t ? t.name : `Team ${team}`;
}
