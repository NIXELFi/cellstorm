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

/** When/where to start the custom music source given the current playback frame. */
export interface MusicCue {
  /** Seconds from "now" (AudioContext clock) to start the source — 0 if it should already be playing. */
  delaySec: number;
  /** Offset into the decoded track to begin from. */
  trackOffsetSec: number;
}

/**
 * Compute the music start cue for a playback frame. The music begins at `startOffsetSec` into the
 * VIDEO, playing from `startInTrackSec` into the track. If playback starts before the offset, the
 * source is scheduled to begin after the remaining delay; if after, it begins immediately from the
 * matching point inside the track (so scrubbing/resuming stays in sync). Returns null when disabled.
 */
export function musicCue(
  frame: number,
  fps: number,
  s: { enabled: boolean; startOffsetSec: number; startInTrackSec: number },
): MusicCue | null {
  if (!s.enabled) return null;
  const videoTime = frame / fps;
  if (videoTime < s.startOffsetSec) {
    return { delaySec: s.startOffsetSec - videoTime, trackOffsetSec: Math.max(0, s.startInTrackSec) };
  }
  return { delaySec: 0, trackOffsetSec: Math.max(0, s.startInTrackSec + (videoTime - s.startOffsetSec)) };
}
