// Runtime chart for one piece + tier: chart notes the player hits, the notes that play by
// themselves, and the bar grid, all in song-clock ms with the tier's tempo factor applied.
import type { Piece, TierName } from "../piece.ts";

export type PlayNote = {
  time: number;
  lane: number;
  hold: number; // ms, 0 for taps
  pitch: number;
  velocity: number;
  duration: number;
};

export type AutoNote = { time: number; pitch: number; velocity: number; duration: number };

export type Chart = {
  notes: PlayNote[];
  auto: AutoNote[]; // sorted by time
  bars: number[];
  beats: number[];
  beatMs: number; // beat length at bar 1, for the count-in
  end: number;
};

export function buildChart(piece: Piece, tierName: TierName, keySound: boolean): Chart {
  const tier = piece.tiers[tierName];
  const k = 1 / tier.tempoFactor;
  const charted = new Set(tier.notes.map((n) => n.id));
  const byId = new Map(piece.notes.map((n) => [n.id, n]));
  const notes = tier.notes.map((c) => {
    const n = byId.get(c.id)!;
    return { time: n.start * k, lane: c.lane, hold: (c.hold ?? 0) * k, pitch: n.pitch, velocity: n.velocity, duration: n.duration * k };
  });
  const auto = piece.notes
    .filter((n) => !keySound || !charted.has(n.id))
    .map((n) => ({ time: n.start * k, pitch: n.pitch, velocity: n.velocity, duration: n.duration * k }));
  const bars = piece.bars.map((t) => t * k);
  const beats = piece.beats.map((t) => t * k);
  const b = beats.findIndex((t) => t >= bars[0]);
  return { notes, auto, bars, beats, beatMs: beats[b + 1] - beats[b], end: piece.duration * k };
}
