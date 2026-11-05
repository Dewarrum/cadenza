import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildPiece, loadSource, ROOT } from "../../tools/lib/build.ts";

test("regenerating every piece is deterministic and matches the committed piece files", () => {
  const sources = readdirSync(join(ROOT, "sources")).filter((f) => f.endsWith(".mid"));
  assert.ok(sources.length >= 2);
  for (const file of sources) {
    const { midi, meta, overrides } = loadSource(join(ROOT, "sources", file));
    const first = buildPiece(midi, meta, overrides).piece;
    assert.deepEqual(buildPiece(midi, meta, overrides).piece, first);
    const committed = JSON.parse(readFileSync(join(ROOT, "pieces", `${meta.id}.json`), "utf8"));
    assert.deepEqual(committed, JSON.parse(JSON.stringify(first)), `pieces/${meta.id}.json is stale: npm run pieces:build`);
  }
});
