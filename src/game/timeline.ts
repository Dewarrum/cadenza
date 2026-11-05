// Where the song clock starts and where the count-in clicks fall, at the start and after a
// pause. Pure functions over the chart's beat grid; times are song-clock ms.
import type { Chart } from "./chart.ts";

type Grid = Pick<Chart, "bars" | "beats" | "beatMs">;

// One run of the song clock: its start time, the count-in clicks, and the time from which the
// notes that play by themselves sound (earlier ones already sounded before a pause).
export type Run = { start: number; clicks: number[]; soundFrom: number };

const START_BEATS = 4;
const RESUME_BEATS = 3;
const START_LEAD_MS = 600; // silence before the first count-in click
const RESUME_LEAD_MS = 300;

const REWIND_MS = 2000;

// The `n` grid beats right before song time `at`. Before the first bar the grid runs on
// backwards at the opening beat length.
export function beatsBefore({ bars, beats, beatMs }: Grid, at: number, n: number): number[] {
  const back = Math.max(0, Math.ceil((bars[0] - at) / beatMs)) + n;
  const pre = Array.from({ length: back }, (_, i) => bars[0] - (back - i) * beatMs);
  return [...pre, ...beats.filter((t) => t >= bars[0])].filter((t) => t < at).slice(-n);
}

// The first note needs the approach time to fall in from the top.
export function startRun(grid: Grid, approachMs = 1500): Run {
  const clicks = beatsBefore(grid, grid.bars[0], START_BEATS);
  return { start: Math.min(clicks[0], -approachMs) - START_LEAD_MS, clicks, soundFrom: -Infinity };
}

// After a pause at `pausedAt` the clock goes back about 2 s (further when three beats of the
// piece take longer), counts in on the three beats before the pause, and the music picks up
// where it stopped.
export function resumeRun(grid: Grid, pausedAt: number): Run {
  const clicks = beatsBefore(grid, pausedAt, RESUME_BEATS);
  return { start: Math.min(pausedAt - REWIND_MS, clicks[0] - RESUME_LEAD_MS), clicks, soundFrom: pausedAt };
}
