// Pure decision logic for the harness preview soundtrack. Kept separate from the Web Audio glue so
// the (bug-prone) "when should sound be playing, and from where" rules are unit-testable.

export interface PreviewAudioState {
  /** The user's Sound toggle. */
  enabled: boolean;
  /** Player is currently advancing. */
  playing: boolean;
  /** Playback speed multiplier. */
  speed: number;
  /** Battle finished. */
  ended: boolean;
}

/** Start offset (seconds) into the soundtrack for a given playback frame. */
export function audioOffsetSec(frame: number, fps: number): number {
  return frame / fps;
}

/**
 * Whether the preview soundtrack should be sounding. Audio is only synced at 1x playback (the
 * renderer is the real fidelity check); at other speeds or while paused/ended it stays silent.
 */
export function audioShouldPlay(s: PreviewAudioState): boolean {
  return s.enabled && s.playing && s.speed === 1 && !s.ended;
}
