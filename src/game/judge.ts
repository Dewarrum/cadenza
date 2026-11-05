// Timing judgement. Pure functions; times in ms on the song clock (tempo factor applied).
// `offset` is the global audio offset from calibration: a positive offset means the player's
// taps land that much late, so it is subtracted from every tap before judging.

export const WINDOWS = { perfect: 50, great: 95, good: 140, earlyMiss: 180 };
export const HOLD_OK = 0.8; // a hold kept for less than this fraction is broken

export type Judgement = "perfect" | "great" | "good" | "miss";

// delta = tap time - target time. Returns null when the tap is too far from the note to count.
// A tap 140-180 ms early consumes the note as a miss, so mashing does not pay.
export function judgeDelta(delta: number): Judgement | null {
  const d = Math.abs(delta);
  if (d <= WINDOWS.perfect) return "perfect";
  if (d <= WINDOWS.great) return "great";
  if (d <= WINDOWS.good) return "good";
  if (delta < 0 && d <= WINDOWS.earlyMiss) return "miss";
  return null;
}

// Index of the note a tap hits: the earliest open note in `lane` (any lane when lane is null)
// within reach of the tap, or -1. `notes` must be sorted by time.
export function pickNote(
  notes: readonly { time: number; lane: number }[],
  isOpen: (index: number) => boolean,
  lane: number | null,
  tapTime: number,
  offset = 0,
): number {
  const t = tapTime - offset;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (n.time - t > WINDOWS.earlyMiss) break;
    if (!isOpen(i) || (lane !== null && n.lane !== lane)) continue;
    if (judgeDelta(t - n.time) !== null) return i;
  }
  return -1;
}

// True once a note can no longer be hit.
export function isExpired(noteTime: number, now: number, offset = 0): boolean {
  return now - offset - noteTime > WINDOWS.good;
}

// Fraction of a hold kept down, 0-1, measured from the target time.
export function holdFraction(noteTime: number, holdLength: number, releaseTime: number, offset = 0): number {
  return Math.min(1, Math.max(0, (releaseTime - offset - noteTime) / holdLength));
}
