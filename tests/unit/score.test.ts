import assert from "node:assert/strict";
import { test } from "node:test";
import { grade, summarize } from "../../src/game/score.ts";

test("accuracy, grade, combo and broken holds", () => {
  const s = summarize([
    { judgement: "perfect" },
    { judgement: "great" },
    { judgement: "perfect", holdFraction: 0.5 }, // broken hold: half of 100%
    { judgement: "good" },
    { judgement: "perfect", holdFraction: 0.85 }, // kept long enough: full value
    null, // never judged = miss
  ]);
  assert.equal(s.accuracy.toFixed(2), ((1 + 0.7 + 0.5 + 0.4 + 1) / 6 * 100).toFixed(2));
  assert.equal(s.grade, "D");
  assert.deepEqual(s.counts, { perfect: 3, great: 1, good: 1, miss: 1 });
  assert.equal(s.brokenHolds, 1);
  assert.equal(s.maxCombo, 2);
  assert.equal(s.fullCombo, false);
  assert.deepEqual([95, 94.9, 90, 80, 65, 64.9].map(grade), ["S", "A", "A", "B", "C", "D"]);
});
