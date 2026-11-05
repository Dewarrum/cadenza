import assert from "node:assert/strict";
import { test } from "node:test";
import { assignLanes } from "../../tools/lib/lanes.ts";

test("pitch rank in a 2 s window: a rising phrase moves right, a repeat stays", () => {
  const phrase = [60, 62, 64, 65, 65].map((pitch, i) => ({ start: i * 400, pitch }));
  assert.deepEqual(assignLanes(phrase), [0, 1, 2, 3, 3]);
});
