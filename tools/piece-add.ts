// Converts a MIDI file into pieces/<id>.json.
// Usage: npm run piece:add -- sources/<file>.mid [--id <piece-id>]
// Reads sources/<file>.meta.json for title, composer, opus, source, license and the pickup
// length ("pickup": "1/8" = an eighth-note anacrusis before bar 1).
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Piece, PieceNote } from "../src/piece.ts";
import { classifyHands, readMidi } from "./lib/midi.ts";
import { EASY, easyTier } from "./lib/tiers.ts";

type Meta = {
  title: string;
  composer: string;
  opus: string;
  page: string;
  url: string;
  engraver: string;
  license: string;
  pickup?: string;
};

const args = process.argv.slice(2);
const midiPath = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--id");
if (!midiPath) throw new Error("usage: piece:add -- <file.mid> [--id <piece-id>]");
const idFlag = args.indexOf("--id");
const id = idFlag >= 0 ? args[idFlag + 1] : basename(midiPath, ".mid").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
const meta = JSON.parse(readFileSync(midiPath.replace(/\.midi?$/, ".meta.json"), "utf8")) as Meta;
const log = (line: string) => console.log(line);

const midi = readMidi(readFileSync(midiPath));
log(`${basename(midiPath)}: ${midi.tracks.length} note tracks, ${midi.ppq} ticks per quarter`);
if (midi.usesVolumeDynamics) log(`dynamics found as channel volume (CC7): folded into note velocities`);
const hands = classifyHands(midi.tracks, log);

const first = Math.min(...midi.tracks.flatMap((t) => t.notes.map((n) => n.startTick)));
const offset = midi.tickToMs(first);
const ms = (tick: number) => Math.round((midi.tickToMs(tick) - offset) * 10) / 10;

const raw = midi.tracks
  .flatMap((t) => t.notes)
  .sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
const notes: PieceNote[] = raw.map((n, id) => ({
  id,
  pitch: n.pitch,
  start: Math.round(ms(n.startTick)),
  duration: Math.round(ms(n.endTick) - ms(n.startTick)),
  velocity: n.velocity,
  track: n.track,
  hand: hands.get(n.track) ?? (n.pitch >= 60 ? "R" : "L"),
}));

// Bar lines and beats. Compound meters (6/8, 9/8, 12/8...) beat in dotted quarters.
const [num, den] = (meta.pickup ?? "0/1").split("/").map(Number);
const pickupTicks = first + (num / den) * 4 * midi.ppq;
const bars: number[] = [];
const beats: number[] = [];
const beatTicksOf = (n: number, d: number) => ((n % 3 === 0 && n > 3 && d >= 8 ? 3 : 1) * 4 * midi.ppq) / d;
midi.timeSignatures.forEach((ts, i) => {
  const from = i === 0 ? pickupTicks : ts.tick;
  const to = midi.timeSignatures[i + 1]?.tick ?? midi.endTick + 1;
  const barTicks = (ts.numerator * 4 * midi.ppq) / ts.denominator;
  const beatTicks = beatTicksOf(ts.numerator, ts.denominator);
  if (i === 0) for (let t = from - beatTicks; t >= first; t -= beatTicks) beats.unshift(ms(t));
  for (let bar = from; bar < to; bar += barTicks) {
    bars.push(ms(bar));
    for (let b = bar; b < Math.min(bar + barTicks, to); b += beatTicks) beats.push(ms(b));
  }
});

const easy = easyTier({ notes, bars, beats });
const duration = Math.max(...notes.map((n) => n.start + n.duration));
const piece: Piece = {
  id,
  title: meta.title,
  composer: meta.composer,
  opus: meta.opus,
  duration,
  source: { url: meta.url, page: meta.page, engraver: meta.engraver },
  license: meta.license,
  tempoMap: midi.tempos.map((t) => ({ start: Math.max(0, ms(t.tick)), qpm: Math.round(60e8 / t.usPerQuarter) / 100 })),
  timeSignatures: midi.timeSignatures.map((t) => ({ start: Math.max(0, ms(t.tick)), numerator: t.numerator, denominator: t.denominator })),
  bars,
  beats,
  notes,
  // S1: Normal and Hard are placeholders equal to Easy until the S3 generator lands.
  tiers: { easy, normal: structuredClone(easy), hard: structuredClone(easy) },
};

// One note per line keeps diffs of regenerated pieces readable.
function format(value: unknown, indent = ""): string {
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

const out = join(import.meta.dirname, "..", "pieces", `${id}.json`);
writeFileSync(out, format(piece) + "\n");

const right = notes.filter((n) => n.hand === "R");
const ornaments = notes.filter((n) => n.duration < EASY.ornamentMs).length;
log(`notes: ${notes.length} (right ${right.length}, left ${notes.length - right.length}), ${ornaments} ornaments under ${EASY.ornamentMs} ms`);
log(`duration ${(duration / 1000).toFixed(1)} s, ${bars.length} bars, tempo ${piece.tempoMap.map((t) => t.qpm).join("/")} qpm`);
for (const [name, tier] of Object.entries(piece.tiers)) {
  const holds = tier.notes.filter((n) => n.hold).length;
  const placeholder = name === "easy" ? "" : " (placeholder = easy)";
  log(`${name}: ${tier.notes.length} notes, ${holds} holds, level ${tier.level}${placeholder}`);
}
log(`wrote ${out}`);
