import assert from "node:assert/strict";
import { test } from "node:test";
import type { TierName } from "../../src/piece.ts";
import { makeTier, type Note } from "../../tools/lib/tiers.ts";

// 4/4 at 60 bpm: beats every second, bars every four.
const grid = { bars: [0, 4000, 8000], beats: [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000] };
const chord = (start: number, rh: number[], lh: number[] = []): Note[] => [
  ...rh.map((pitch) => ({ id: `R${start}:${pitch}`, pitch, start, duration: 400, hand: "R" as const })),
  ...lh.map((pitch) => ({ id: `L${start}:${pitch}`, pitch, start, duration: 400, hand: "L" as const })),
];
// Chart pitches per onset, and every onset's lanes are adjacent.
function onsets(name: TierName, notes: Note[]) {
  const result = makeTier(name, notes, grid);
  const byId = new Map(notes.map((n) => [n.id, n]));
  const at = new Map<number, { pitch: number; lane: number }[]>();
  for (const c of result.tier.notes) {
    const n = byId.get(c.id)!;
    at.set(n.start, [...(at.get(n.start) ?? []), { pitch: n.pitch, lane: c.lane }]);
  }
  for (const group of at.values()) {
    const lanes = group.map((g) => g.lane).sort();
    assert.deepEqual(lanes, lanes.map((_, i) => lanes[0] + i), "chord lanes are adjacent");
  }
  return { result, pitches: [...at.values()].map((g) => g.map((x) => x.pitch).sort((a, b) => a - b)) };
}

test("normal: top two right-hand notes, bass on the bar line and on beat 3 when the right hand is single", () => {
  const notes = [
    ...chord(0, [72, 76, 79], [36, 48]), // bar line: melody + bass
    ...chord(1000, [74, 77], [43]), // beat 2: right-hand pair, no bass
    ...chord(1500, [72, 76]), // between beats: single note
    ...chord(2000, [79], [41]), // beat 3: melody + bass
    ...chord(3000, [77], [40]), // beat 4: melody only
  ];
  const { result, pitches } = onsets("normal", notes);
  assert.deepEqual(pitches, [[36, 79], [74, 77], [76], [41, 79], [77]]);
  assert.equal(result.tier.chords.length, 3);
});

test("hard: two right-hand notes and the bass, three right-hand notes when the left hand rests, two between beats", () => {
  const notes = [...chord(0, [72, 76, 79], [36, 48]), ...chord(1000, [72, 76, 79]), ...chord(1500, [72, 76, 79], [40])];
  assert.deepEqual(onsets("hard", notes).pitches, [[36, 76, 79], [72, 76, 79], [40, 79]]);
});

test("same lane closer than 120 ms: the later note shifts sideways, or is dropped when no lanes are free", () => {
  // A repeated note 110 ms later would stay in its lane; it moves next door instead.
  const repeat = onsets("hard", [...chord(1000, [72]), ...chord(1110, [72])]);
  assert.equal(repeat.result.tier.notes.length, 2);
  assert.notEqual(repeat.result.tier.notes[0].lane, repeat.result.tier.notes[1].lane);
  // A three-note chord leaves one free lane; a pair 110 ms later loses its blocked note.
  const full = onsets("hard", [...chord(1000, [72, 76, 79]), ...chord(1110, [74, 77], [38])]);
  assert.deepEqual(full.pitches.map((p) => p.length), [3, 1]);
  assert.match(full.result.warnings[0], /dropped, lane \d struck 110 ms before/);
});
