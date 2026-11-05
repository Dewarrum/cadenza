import assert from "node:assert/strict";
import { test } from "node:test";
import { calibrate, tapDeltas } from "../../src/game/calibration.ts";

test("calibration: nearest tap per click, outliers dropped, median; late taps give a positive offset", () => {
  const clicks = Array.from({ length: 16 }, (_, i) => i * 600);
  // Taps 40 ms late with ±10 ms of wobble, one stray tap, one far-off tap, one click missed.
  const taps = clicks.slice(1).map((c, i) => c + 40 + ((i % 3) - 1) * 10);
  taps[5] += 200; // way off: an outlier
  taps.push(clicks[8] + 320); // more than half an interval from click 8: belongs to click 9, which already has a nearer tap
  const deltas = tapDeltas(taps, clicks);
  assert.equal(deltas.length, 15);
  assert.deepEqual(calibrate(deltas), { offsetMs: 40, used: 14, dropped: 1 });
  assert.equal(calibrate(deltas.slice(0, 7)), null); // too few taps
});
