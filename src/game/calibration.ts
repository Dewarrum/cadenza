// Calibration maths. The player taps along to evenly spaced clicks; times are song-clock ms.
// delta = tap - click: positive means the tap landed after the click, and that is the sign of the
// audio offset the judge subtracts from every tap (see judge.ts).

export const CALIBRATION = { countIn: 4, clicks: 16, intervalMs: 600, minTaps: 8 }; // 100 bpm

// Each click keeps its nearest tap within half an interval; other taps are ignored.
export function tapDeltas(taps: readonly number[], clicks: readonly number[], intervalMs = CALIBRATION.intervalMs): number[] {
  return clicks.flatMap((c) => {
    const near = taps.map((t) => t - c).filter((d) => Math.abs(d) < intervalMs / 2);
    return near.length ? [near.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a))] : [];
  });
}

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Drops deltas more than 3 robust standard deviations (and at least 30 ms) from the median;
// the offset is the median of the rest. null when fewer than `minTaps` remain.
export function calibrate(deltas: readonly number[], minTaps = CALIBRATION.minTaps): { offsetMs: number; used: number; dropped: number } | null {
  if (deltas.length < minTaps) return null;
  const m = median(deltas);
  const spread = 1.4826 * median(deltas.map((d) => Math.abs(d - m)));
  const kept = deltas.filter((d) => Math.abs(d - m) <= Math.max(30, 3 * spread));
  if (kept.length < minTaps) return null;
  return { offsetMs: Math.round(median(kept)), used: kept.length, dropped: deltas.length - kept.length };
}
