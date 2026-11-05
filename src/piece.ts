// Shape of pieces/<id>.json, written by tools/piece-add.ts and read by the game.
// All times are milliseconds at tempo factor 1.0, measured from the first note.

export type Hand = "R" | "L";

export type PieceNote = {
  id: number;
  pitch: number; // MIDI note number
  start: number;
  duration: number;
  velocity: number; // 1-127, picks the sample layer
  track: number; // MIDI track index in the source file
  hand: Hand;
};

export type ChartNote = {
  id: number; // PieceNote id
  lane: number; // 0-3
  hold?: number; // hold length in ms; absent for taps
};

export type Tier = {
  level: number; // 1-10
  tempoFactor: number; // 1.0 = written tempo
  notes: ChartNote[]; // sorted by start time
  chords: number[][]; // groups of PieceNote ids hit together
};

export type TierName = "easy" | "normal" | "hard";

export type Piece = {
  id: string;
  title: string;
  composer: string;
  opus: string;
  duration: number;
  source: { url: string; page: string; engraver: string };
  license: string;
  tempoMap: { start: number; qpm: number }[]; // qpm = quarter notes per minute
  timeSignatures: { start: number; numerator: number; denominator: number }[];
  bars: number[]; // downbeat times
  beats: number[]; // beat times (dotted quarters in compound meters)
  notes: PieceNote[];
  tiers: Record<TierName, Tier>;
};
