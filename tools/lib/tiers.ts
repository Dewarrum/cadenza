// Chart generation. S1 implements only the Easy rule from DESIGN.md; S3 replaces this file.
import type { ChartNote, PieceNote, Tier } from "../../src/piece.ts";
import { assignLanes } from "./lanes.ts";

export const EASY = {
  maxPerSecond: 2, // at most this many chart notes in any 1 s window
  minGapMs: 300, // no two chart notes closer than this
  ornamentMs: 80, // grace notes and ornaments shorter than this are never charted
  holdBeats: 1, // notes at least this many beats long become holds
  holdGapMs: 150, // a hold ends at least this long before the next chart note
  sameOnsetMs: 30, // onsets closer than this count as simultaneous
};

export type Timeline = { notes: PieceNote[]; bars: number[]; beats: number[] };

const near = (times: number[], t: number, tolerance: number) => times.some((x) => Math.abs(x - t) <= tolerance);

function beatLengthAt(beats: number[], t: number): number {
  const i = beats.findLastIndex((b) => b <= t + EASY.sameOnsetMs);
  const j = Math.min(Math.max(i, 0), beats.length - 2);
  return beats[j + 1] - beats[j];
}

// Skyline: a note belongs to the top voice unless a higher note is already sounding at its onset.
function topVoice(notes: PieceNote[]): PieceNote[] {
  const tol = EASY.sameOnsetMs;
  return notes.filter(
    (n) => !notes.some((m) => m.pitch > n.pitch && m.start <= n.start + tol && m.start + m.duration > n.start + tol),
  );
}

// Greedy thinning to the density cap: bar downbeats first, then beats, then everything else;
// longer notes win ties. Fast runs therefore keep only their on-beat notes.
function thin(candidates: PieceNote[], bars: number[], beats: number[]): PieceNote[] {
  const strength = (n: PieceNote) =>
    near(bars, n.start, EASY.sameOnsetMs) ? 2 : near(beats, n.start, EASY.sameOnsetMs) ? 1 : 0;
  const order = [...candidates].sort((a, b) => strength(b) - strength(a) || b.duration - a.duration || a.start - b.start);
  const chosen: PieceNote[] = [];
  const m = EASY.maxPerSecond;
  for (const note of order) {
    const i = chosen.findIndex((c) => c.start > note.start);
    const at = i === -1 ? chosen.length : i;
    const times = [...chosen.slice(0, at), note, ...chosen.slice(at)].map((c) => c.start);
    const gapOk = (at === 0 || times[at] - times[at - 1] >= EASY.minGapMs) && (at === times.length - 1 || times[at + 1] - times[at] >= EASY.minGapMs);
    let densityOk = true;
    for (let j = Math.max(0, at - m); j <= at && j + m < times.length; j++) {
      if (times[j + m] - times[j] < 1000) densityOk = false;
    }
    if (gapOk && densityOk) chosen.splice(at, 0, note);
  }
  return chosen;
}

export function easyTier({ notes, bars, beats }: Timeline): Tier {
  const right = notes.filter((n) => n.hand === "R" && n.duration >= EASY.ornamentMs);
  const melody = topVoice(right);
  const chosen = thin(melody, bars, beats);
  const lanes = assignLanes(chosen, melody);
  const chart: ChartNote[] = chosen.map((n, i) => {
    const next = chosen[i + 1];
    const end = Math.min(n.start + n.duration, next ? next.start - EASY.holdGapMs : Infinity);
    const hold = end - n.start >= EASY.holdBeats * beatLengthAt(beats, n.start) ? Math.round(end - n.start) : 0;
    return hold > 0 ? { id: n.id, lane: lanes[i], hold } : { id: n.id, lane: lanes[i] };
  });
  return { level: level(chosen), tempoFactor: 1, notes: chart, chords: [] };
}

// Provisional level from note density; S3 defines the real scale.
function level(chosen: PieceNote[]): number {
  if (chosen.length < 2) return 1;
  const seconds = (chosen.at(-1)!.start - chosen[0].start) / 1000;
  return Math.min(10, Math.max(1, Math.round((chosen.length / seconds) * 2)));
}
