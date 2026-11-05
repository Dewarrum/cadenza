import assert from "node:assert/strict";
import { test } from "node:test";
import { makeTier, type Note } from "../../tools/lib/tiers.ts";

test("easy: top voice of the right hand, runs thinned to beats, ornaments dropped, long notes held", () => {
  let id = 0;
  const note = (start: number, pitch: number, duration: number, hand: "R" | "L" = "R"): Note => ({ id: String(id++), pitch, start, duration, hand });
  // Beats every 500 ms, bars every 2000 ms. A run of sixteenths over beats 0-1000.
  const run = [0, 125, 250, 375, 500, 625, 750, 875, 1000].map((t, i) => note(t, 72 + i, 125));
  const notes = [
    ...run,
    note(1900, 90, 50), // grace note, under 80 ms
    note(2000, 84, 1500), // long melody note
    note(2500, 76, 400), // inner voice under it
    note(2000, 40, 2000, "L"),
  ];
  const { tier } = makeTier("easy", notes, { bars: [0, 2000, 4000], beats: [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000] });
  const starts = tier.notes.map((c) => notes[Number(c.id)].start);
  assert.deepEqual(starts, [0, 500, 1000, 2000]);
  assert.equal(tier.notes.at(-1)!.hold, 1500);
  assert.equal(tier.notes[0].hold, undefined);
});
