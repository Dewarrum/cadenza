import assert from "node:assert/strict";
import { test } from "node:test";
import { holdFraction, judgeDelta, pickNote } from "../../src/game/judge.ts";

test("windows, anti-mash consume and offset", () => {
  assert.deepEqual(
    [-50, 51, -95, 140, -141, -180, -181, 141].map(judgeDelta),
    ["perfect", "great", "great", "good", "miss", "miss", null, null],
  );
  const notes = [
    { time: 1000, lane: 0 },
    { time: 1300, lane: 1 },
  ];
  const open = () => true;
  assert.equal(pickNote(notes, open, 1, 1150), 1); // 150 ms early on lane 1: consumed
  assert.equal(pickNote(notes, open, null, 1100), 0); // Space: any lane, earliest note in reach
  assert.equal(pickNote(notes, open, 0, 1300), -1); // 300 ms late: nothing
  assert.equal(pickNote(notes, open, 0, 1300, 260), 0); // a 260 ms offset brings it back
  assert.equal(holdFraction(1000, 1000, 1700), 0.7);
});
