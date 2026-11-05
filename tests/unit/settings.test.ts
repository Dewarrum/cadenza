import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULTS, parseSettings, rebind } from "../../src/settings.ts";

test("settings: missing or broken -> defaults, unknown fields dropped, bad fields fall back alone", () => {
  assert.deepEqual(parseSettings(null), DEFAULTS);
  assert.deepEqual(parseSettings("{not json"), DEFAULTS);
  assert.equal(parseSettings(null, true).howtoSeen, true); // the S2 how-to flag migrates
  const s = parseSettings(JSON.stringify({ audioOffsetMs: 37.4, volume: 7, keys: ["KeyA", "KeyA", "KeyJ", "KeyK"], theme: "x" }));
  assert.deepEqual(s, { ...DEFAULTS, audioOffsetMs: 37 });
  assert.equal(rebind(DEFAULTS.keys, 0, "KeyF"), "F is already lane 2");
  assert.deepEqual(rebind(DEFAULTS.keys, 0, "KeyS"), ["KeyS", "KeyF", "KeyJ", "KeyK"]);
});
