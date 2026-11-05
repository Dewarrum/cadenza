import assert from "node:assert/strict";
import { test } from "node:test";
import { resumeRun, startRun } from "../../src/game/timeline.ts";

test("count-in on the beat grid; resume rewinds about 2 s and sounds from the pause", () => {
  const grid = { bars: [0, 2000], beats: [0, 500, 1000, 1500, 2000, 2500, 3000], beatMs: 500 };
  assert.deepEqual(startRun(grid), { start: -2600, clicks: [-2000, -1500, -1000, -500], soundFrom: -Infinity });
  assert.deepEqual(resumeRun(grid, 2700), { start: 700, clicks: [1500, 2000, 2500], soundFrom: 2700 });
  // Slow beats stretch the rewind to fit three clicks; before bar 1 the grid runs on backwards.
  const slow = { ...grid, beats: [0, 1000, 2000, 3000], beatMs: 1000 };
  assert.deepEqual(resumeRun(slow, 1200), { start: -1300, clicks: [-1000, 0, 1000], soundFrom: 1200 });
});
