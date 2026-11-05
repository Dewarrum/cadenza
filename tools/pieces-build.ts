// Regenerates every piece from sources/*.mid, so a rule change updates all charts.
// Usage: npm run pieces:build
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildPiece, format, loadSource, ROOT } from "./lib/build.ts";

for (const file of readdirSync(join(ROOT, "sources")).filter((f) => f.endsWith(".mid")).sort()) {
  const { midi, meta, overrides } = loadSource(join(ROOT, "sources", file));
  const { piece, report } = buildPiece(midi, meta, overrides, console.log);
  writeFileSync(join(ROOT, "pieces", `${piece.id}.json`), format(piece) + "\n");
  for (const line of report) console.log(line);
  console.log(`wrote pieces/${piece.id}.json\n`);
}
