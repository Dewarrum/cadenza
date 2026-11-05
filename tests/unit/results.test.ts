import assert from "node:assert/strict";
import { test } from "node:test";
import type { Summary } from "../../src/game/score.ts";
import { mergeBest } from "../../src/results.ts";

const run = (accuracy: number, fullCombo: boolean, maxCombo: number) => ({ accuracy, fullCombo, maxCombo, grade: accuracy >= 90 ? "A" : "B" }) as Summary;

test("best result: a higher accuracy replaces the best; full combo and max combo count from any run", () => {
  const first = mergeBest(undefined, run(85, true, 120), "d1");
  assert.deepEqual(first, { isNew: true, best: { accuracy: 85, grade: "B", date: "d1", fullCombo: true, maxCombo: 120, plays: 1 } });
  const worse = mergeBest(first.best, run(80, false, 60), "d2");
  assert.deepEqual(worse, { isNew: false, best: { ...first.best, plays: 2 } });
  const better = mergeBest(worse.best, run(91, false, 90), "d3");
  assert.deepEqual(better, { isNew: true, best: { accuracy: 91, grade: "A", date: "d3", fullCombo: true, maxCombo: 120, plays: 3 } });
});
