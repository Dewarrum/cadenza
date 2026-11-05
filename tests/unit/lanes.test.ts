import assert from "node:assert/strict";
import { test } from "node:test";
import { assignLanes } from "../../tools/lib/lanes.ts";

test("pitch rank in a 2 s window: a rising phrase moves right, a repeat stays, a small step stays close", () => {
  const single = (pitches: number[], gap = 400) => pitches.map((pitch, i) => [{ start: i * gap, pitch }]);
  assert.deepEqual(assignLanes(single([60, 62, 64, 65, 65])), [0, 1, 2, 3, 3]);
  // Bar 4 of the Nocturne: the window loses the high notes and ranks A-flat 5 top, but a
  // semitone up from G5 moves one lane, not three.
  assert.deepEqual(assignLanes(single([86, 84, 82, 80, 79, 80, 72], 227)), [3, 2, 1, 0, 0, 1, 0]);
});
