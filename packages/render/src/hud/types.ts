// Config-driven HUD. Each element is toggleable/editable so the same compositor renders the
// broadcast layer identically in the harness preview and the 4K renderer. Pure data — no
// Pixi imports — safe to unit-test and to share with the harness HUD editor.

export interface HudConfig {
  showCounters: boolean;
  showLeaderboard: boolean;
  showIntro: boolean;
  showWinner: boolean;
  /** Editable intro title, e.g. "Plague vs Tank — who wins?". Empty = derive from matchup. */
  introTitle: string;
  /** Length of the intro hook, in seconds. */
  introSeconds: number;
}

export const DEFAULT_HUD: HudConfig = {
  showCounters: true,
  showLeaderboard: true,
  showIntro: true,
  showWinner: true,
  introTitle: "",
  introSeconds: 2.5,
};
