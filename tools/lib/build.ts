// Builds a piece file from a MIDI file, its meta file (source facts) and the piece's overrides
// (musical decisions), and reports what came out. Shared by piece:add, pieces:build and tests.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Piece, PieceNote, TierName } from "../../src/piece.ts";
import { classifyHands, type MidiData, readMidi } from "./midi.ts";
import { LEVEL_FORMULA, makeTier, RULES, type TierResult } from "./tiers.ts";

export const ROOT = join(import.meta.dirname, "..", "..");
const TIER_NAMES: TierName[] = ["easy", "normal", "hard"];

// sources/<name>.meta.json: facts about the source, copied into the piece file.
export type Meta = {
  id: string; // piece id: pieces/<id>.json and pieces/<id>.overrides.json
  title: string;
  composer: string;
  opus: string;
  page: string;
  url: string;
  engraver: string;
  license: string;
};

// A point on the tempo map: from bar.beat on, the MIDI tempo times `ratio`, or `bpm` beats
// (dotted quarters in compound meters) per minute. `ramp` changes gradually from the previous
// point instead of jumping. Bar 1 is the first full bar; beat 1 its downbeat, fractions allowed.
export type TempoPoint = { bar: number; beat?: number; ratio?: number; bpm?: number; ramp?: boolean };

// pieces/<id>.overrides.json: musical decisions the rules cannot make. Note ids are PieceNote ids.
export type Overrides = {
  comment?: string[]; // why the overrides below exist; ignored by the pipeline
  pickup?: string; // anacrusis before bar 1 as a note value, "1/8"
  tempoMap?: TempoPoint[];
  laneOverrides?: Record<string, number>; // note id -> lane 0-3, on every tier that charts it
  drop?: string[]; // never charted (they still sound by themselves)
  forceHold?: string[]; // holds even when shorter than a beat
  tiers?: Partial<Record<TierName, { tempoFactor?: number; include?: string[]; exclude?: string[] }>>;
};

export type Built = { piece: Piece; tiers: Record<TierName, TierResult>; report: string[] };

export function loadSource(midiPath: string, id?: string): { midi: Uint8Array; meta: Meta; overrides: Overrides } {
  const meta = JSON.parse(readFileSync(midiPath.replace(/\.midi?$/, ".meta.json"), "utf8")) as Meta;
  if (id) meta.id = id;
  let overrides: Overrides = {};
  try {
    overrides = JSON.parse(readFileSync(join(ROOT, "pieces", `${meta.id}.overrides.json`), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return { midi: readFileSync(midiPath), meta, overrides };
}

// Compound meters (6/8, 9/8, 12/8...) beat in dotted quarters.
const beatQuarters = (n: number, d: number) => ((n % 3 === 0 && n > 3 && d >= 8 ? 3 : 1) * 4) / d;

// Bar and beat ticks from the time signatures and the pickup.
function tickGrid(midi: MidiData, first: number, pickup: string) {
  const [num, den] = pickup.split("/").map(Number);
  const bars: number[] = [];
  const beats: number[] = [];
  const beatTicksAt: number[] = []; // beat length of each bar
  midi.timeSignatures.forEach((ts, i) => {
    const from = i === 0 ? first + (num / den) * 4 * midi.ppq : ts.tick;
    const to = midi.timeSignatures[i + 1]?.tick ?? midi.endTick + 1;
    const barTicks = (ts.numerator * 4 * midi.ppq) / ts.denominator;
    const beatTicks = beatQuarters(ts.numerator, ts.denominator) * midi.ppq;
    if (i === 0) for (let t = from - beatTicks; t >= first; t -= beatTicks) beats.unshift(t);
    for (let bar = from; bar < to; bar += barTicks) {
      bars.push(bar);
      beatTicksAt.push(beatTicks);
      for (let b = bar; b < Math.min(bar + barTicks, to); b += beatTicks) beats.push(b);
    }
  });
  return { bars, beats, beatTicksAt };
}

// Tick -> ms through the MIDI tempo and the overrides' tempo map, integrated tick by tick.
function tempoMapped(midi: MidiData, points: { tick: number; ratio: number; ramp: boolean }[]) {
  const ms = new Float64Array(midi.endTick + 2);
  let ti = 0;
  let pi = -1;
  for (let t = 0; t <= midi.endTick; t++) {
    while (ti + 1 < midi.tempos.length && midi.tempos[ti + 1].tick <= t) ti++;
    while (pi + 1 < points.length && points[pi + 1].tick <= t) pi++;
    const prev = points[pi];
    const next = points[pi + 1];
    let ratio = prev?.ratio ?? 1;
    if (next?.ramp) {
      const from = prev ?? { tick: 0, ratio: 1 };
      ratio = from.ratio + ((next.ratio - from.ratio) * (t - from.tick)) / (next.tick - from.tick);
    }
    ms[t + 1] = ms[t] + midi.tempos[ti].usPerQuarter / midi.ppq / 1000 / ratio;
  }
  return (tick: number) => ms[Math.min(Math.max(0, Math.round(tick)), midi.endTick + 1)];
}

export function buildPiece(bytes: Uint8Array, meta: Meta, overrides: Overrides, log: (line: string) => void = () => {}): Built {
  const midi = readMidi(bytes);
  log(`${meta.id}: ${midi.tracks.length} note tracks, ${midi.ppq} ticks per quarter`);
  if (midi.usesVolumeDynamics) log(`dynamics found as channel volume (CC7): folded into note velocities`);
  const hands = classifyHands(midi.tracks, log);

  const first = Math.min(...midi.tracks.flatMap((t) => t.notes.map((n) => n.startTick)));
  const grid = tickGrid(midi, first, overrides.pickup ?? "0/1");
  const qpmAt = (tick: number) => 60e6 / midi.tempos.findLast((t) => t.tick <= tick)!.usPerQuarter;
  const points = (overrides.tempoMap ?? [])
    .map((p) => {
      const bar = grid.bars[p.bar - 1];
      if (bar === undefined) throw new Error(`tempoMap: no bar ${p.bar}`);
      const tick = Math.round(bar + ((p.beat ?? 1) - 1) * grid.beatTicksAt[p.bar - 1]);
      const ratio = p.bpm ? (p.bpm * grid.beatTicksAt[p.bar - 1]) / midi.ppq / qpmAt(tick) : (p.ratio ?? 1);
      return { tick, ratio, ramp: p.ramp ?? false };
    })
    .sort((a, b) => a.tick - b.tick); // stable: a step written after a ramp to the same point wins
  const tickMs = tempoMapped(midi, points);
  const offset = tickMs(first);
  const ms = (tick: number) => Math.round((tickMs(tick) - offset) * 10) / 10;

  const raw = midi.tracks.flatMap((t) => t.notes).sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
  const notes: PieceNote[] = raw.map((n) => ({
    id: `${n.track}:${n.startTick}:${n.pitch}`,
    pitch: n.pitch,
    start: Math.round(ms(n.startTick)),
    duration: Math.round(ms(n.endTick) - ms(n.startTick)),
    velocity: n.velocity,
    track: n.track,
    hand: hands.get(n.track) ?? (n.pitch >= 60 ? "R" : "L"),
  }));
  const ids = new Set(notes.map((n) => n.id));
  if (ids.size !== notes.length) throw new Error("two notes share track, tick and pitch");

  const unknown = [
    ...Object.keys(overrides.laneOverrides ?? {}),
    ...(overrides.drop ?? []),
    ...(overrides.forceHold ?? []),
    ...Object.values(overrides.tiers ?? {}).flatMap((t) => [...(t.include ?? []), ...(t.exclude ?? [])]),
  ].filter((id) => !ids.has(id));
  if (unknown.length > 0) throw new Error(`overrides name notes that do not exist: ${unknown.join(", ")}`);

  const bars = grid.bars.map(ms);
  const beats = grid.beats.map(ms);
  const tiers = Object.fromEntries(
    TIER_NAMES.map((name) => {
      const o = overrides.tiers?.[name] ?? {};
      return [name, makeTier(name, notes, { bars, beats }, { ...o, drop: overrides.drop, lanes: overrides.laneOverrides, forceHold: overrides.forceHold })];
    }),
  ) as Record<TierName, TierResult>;

  // Tempo map of the piece: the MIDI's tempo changes, then the overrides' points.
  const ratioAt = (tick: number) => points.findLast((p) => p.tick <= tick)?.ratio ?? 1;
  const tempoMap: Piece["tempoMap"] = [
    ...midi.tempos.map((t) => ({ tick: t.tick, ratio: ratioAt(t.tick), ramp: false })),
    ...points,
  ]
    .sort((a, b) => a.tick - b.tick)
    .map(({ tick, ratio, ramp }) => {
      const point = { start: Math.max(0, ms(tick)), qpm: Math.round(qpmAt(tick) * ratio * 100) / 100 };
      return ramp ? { ...point, ramp: true as const } : point;
    });
  const piece: Piece = {
    id: meta.id,
    title: meta.title,
    composer: meta.composer,
    opus: meta.opus,
    duration: Math.max(...notes.map((n) => n.start + n.duration)),
    source: { url: meta.url, page: meta.page, engraver: meta.engraver },
    license: meta.license,
    tempoMap,
    timeSignatures: midi.timeSignatures.map((t) => ({ start: Math.max(0, ms(t.tick)), numerator: t.numerator, denominator: t.denominator })),
    bars,
    beats,
    notes,
    tiers: Object.fromEntries(TIER_NAMES.map((name) => [name, tiers[name].tier])) as Piece["tiers"],
  };
  return { piece, tiers, report: report(piece, tiers) };
}

const pct = (a: number, b: number) => `${b ? Math.round((100 * a) / b) : 0}%`;

function report(piece: Piece, tiers: Record<TierName, TierResult>): string[] {
  const notes = piece.notes;
  const right = notes.filter((n) => n.hand === "R").length;
  const ornaments = notes.filter((n) => n.duration < RULES.ornamentMs).length;
  const lines = [
    `notes: ${notes.length} (right ${right}, left ${notes.length - right}), ${ornaments} ornaments under ${RULES.ornamentMs} ms`,
    `duration ${(piece.duration / 1000).toFixed(1)} s, ${piece.bars.length} bars, tempo ${piece.tempoMap.map((t) => `${t.ramp ? "~" : ""}${t.qpm}`).join(" / ")} qpm`,
    `tier    tempo  notes  avg n/s  peak n/s  chords (notes)  holds       lanes                level`,
  ];
  for (const name of TIER_NAMES) {
    const { tier, stats: s } = tiers[name];
    lines.push(
      [
        name.padEnd(6),
        tier.tempoFactor.toFixed(2).padStart(5),
        String(s.notes).padStart(6),
        s.avg.toFixed(2).padStart(8),
        s.peak.toFixed(2).padStart(9),
        `${s.chords} (${pct(s.chordNotes, s.notes)})`.padStart(15),
        `${s.holds} (${pct(s.holds, s.notes)})`.padStart(10),
        `  ${s.lanes.map((n) => String(n).padStart(4)).join(" ")}`.padEnd(22),
        String(tier.level).padStart(5),
      ].join(" "),
    );
  }
  for (const name of TIER_NAMES) {
    const { stats: s, warnings } = tiers[name];
    lines.push(`${name}: ${s.shifted} onsets shifted sideways, ${s.holdCuts} holds cut, ${warnings.length} warnings`);
    for (const w of warnings) lines.push(`  ! ${w} (${where(piece, w.split(":").slice(0, 3).join(":"))})`);
  }
  lines.push(LEVEL_FORMULA);
  return lines;
}

// "bar 12 beat 3.5" for a note id, bar 0 being the pickup. Fractions are measured in ms, so
// they are approximate where the tempo changes inside a beat.
export function where(piece: Piece, id: string): string {
  const n = piece.notes.find((x) => x.id === id);
  if (!n) return id;
  const bar = piece.bars.findLastIndex((b) => b <= n.start + RULES.sameOnsetMs);
  const from = bar < 0 ? -Infinity : piece.bars[bar];
  const beatsBefore = piece.beats.filter((b) => b >= from - RULES.sameOnsetMs && b <= n.start + RULES.sameOnsetMs);
  const b = beatsBefore.at(-1) ?? 0;
  const next = piece.beats.find((x) => x > b + RULES.sameOnsetMs) ?? b + 1;
  const beat = beatsBefore.length + (n.start - b) / (next - b);
  return `bar ${bar + 1} beat ${Math.round(beat * 100) / 100}`;
}

const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const noteName = (p: number) => `${NAMES[p % 12]}${Math.floor(p / 12) - 1}`;

// Chart notes of bars `from`..`to` per tier, for writing overrides.
export function describe(piece: Piece, from: number, to: number): string[] {
  const start = piece.bars[from - 1] ?? 0;
  const end = piece.bars[to] ?? Infinity;
  const byId = new Map(piece.notes.map((n) => [n.id, n]));
  const lines: string[] = [];
  for (const name of TIER_NAMES) {
    lines.push(`${name}, bars ${from}-${to}:`);
    for (const c of piece.tiers[name].notes) {
      const n = byId.get(c.id)!;
      if (n.start < start - RULES.sameOnsetMs || n.start >= end - RULES.sameOnsetMs) continue;
      const lane = "....".split("").map((d, l) => (l === c.lane ? (c.hold ? "H" : "o") : d)).join("");
      lines.push(`  ${lane}  ${c.id.padEnd(14)} ${where(piece, c.id).padEnd(20)} ${n.hand} ${noteName(n.pitch).padEnd(4)}${c.hold ? ` hold ${c.hold} ms` : ""}`);
    }
  }
  return lines;
}

// One note per line keeps diffs of regenerated pieces readable.
export function format(value: unknown, indent = ""): string {
  const inner = indent + "  ";
  if (Array.isArray(value)) {
    if (value.length === 0 || value.every((v) => typeof v !== "object" || v === null)) return JSON.stringify(value);
    return `[\n${value.map((v) => inner + JSON.stringify(v)).join(",\n")}\n${indent}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${format(v, inner)}`);
    return `{\n${entries.join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}
