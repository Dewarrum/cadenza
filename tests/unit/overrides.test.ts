import assert from "node:assert/strict";
import { test } from "node:test";
import { writeMidi } from "midi-file";
import { buildPiece, type Meta } from "../../tools/lib/build.ts";

const Q = 480; // ticks per quarter

// One staff per track, 120 bpm, 4/4. Notes are [tick, pitch, length in ticks].
function midi(staves: Record<string, [number, number, number][]>): Uint8Array {
  const track = (name: string, notes: [number, number, number][]) => {
    const events = notes
      .flatMap(([tick, pitch, len]) => [
        { tick, type: "noteOn", noteNumber: pitch, velocity: 80 },
        { tick: tick + len, type: "noteOff", noteNumber: pitch, velocity: 0 },
      ])
      .sort((a, b) => a.tick - b.tick || (a.type === "noteOff" ? -1 : 1));
    return [
      { deltaTime: 0, type: "trackName", text: name },
      ...events.map(({ tick, ...e }, i) => ({ ...e, channel: 0, deltaTime: tick - (events[i - 1]?.tick ?? 0) })),
      { deltaTime: 0, type: "endOfTrack" },
    ];
  };
  const conductor = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: 500000 },
    { deltaTime: 0, type: "timeSignature", numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
    { deltaTime: 0, type: "endOfTrack" },
  ];
  const tracks = [conductor, ...Object.entries(staves).map(([name, notes]) => track(name, notes))];
  return new Uint8Array(writeMidi({ header: { format: 1, numTracks: tracks.length, ticksPerBeat: Q }, tracks } as never));
}

const meta: Meta = { id: "test", title: "", composer: "", opus: "", page: "", url: "", engraver: "", license: "" };

test("overrides: tempo map steps and ramps, a pinned lane, a dropped note", () => {
  // Four bars: a rising scale in half notes over whole-note basses.
  const bytes = midi({
    upper: Array.from({ length: 8 }, (_, i) => [i * 2 * Q, 60 + 2 * i, 2 * Q]),
    lower: Array.from({ length: 4 }, (_, i) => [i * 4 * Q, 36, 4 * Q]),
  });
  const plain = buildPiece(bytes, meta, {});
  const top = plain.piece.tiers.easy.notes.at(-1)!; // the last, highest note, in lane 3
  assert.equal(top.lane, 3);
  const dropped = plain.piece.tiers.easy.notes[2].id;

  const { piece } = buildPiece(bytes, meta, {
    tempoMap: [
      { bar: 2, ratio: 0.5 }, // half speed from bar 2
      { bar: 3, ratio: 1 },
      { bar: 4, ratio: 0.5, ramp: true }, // back in time, slowing down gradually over bar 3
    ],
    laneOverrides: { [top.id]: 0 },
    drop: [dropped],
  });
  const bar = (i: number) => Math.round(piece.bars[i + 1] - piece.bars[i]);
  assert.deepEqual([bar(0), bar(1)], [2000, 4000]);
  assert.ok(Math.abs(bar(2) - 2000 * 2 * Math.LN2) < 5, `ramp bar ${bar(2)} ms`); // ∫ 1/ratio over a linear ratio 1 -> 0.5
  for (const tier of Object.values(piece.tiers)) {
    assert.equal(tier.notes.find((c) => c.id === top.id)?.lane, 0);
    assert.equal(tier.notes.find((c) => c.id === dropped), undefined);
  }
  assert.ok(piece.notes.some((n) => n.id === dropped), "a dropped note still sounds");
  assert.throws(() => buildPiece(bytes, meta, { drop: ["1:0:99"] }), /do not exist: 1:0:99/);
});
