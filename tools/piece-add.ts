// Converts a MIDI file into pieces/<id>.json and prints the report.
// Usage: npm run piece:add -- sources/<file>.mid [--id <piece-id>] [--show <bar>[-<bar>]]
// Reads sources/<file>.meta.json (source facts) and pieces/<id>.overrides.json (musical
// decisions, optional). --show lists the chart notes of some bars with their ids, for overrides.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildPiece, describe, format, loadSource, ROOT } from "./lib/build.ts";

const args = process.argv.slice(2);
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const midiPath = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!midiPath) throw new Error("usage: piece:add -- <file.mid> [--id <piece-id>] [--show <bar>[-<bar>]]");

const { midi, meta, overrides } = loadSource(midiPath, flag("--id"));
const { piece, report } = buildPiece(midi, meta, overrides, console.log);
const out = join(ROOT, "pieces", `${piece.id}.json`);
writeFileSync(out, format(piece) + "\n");
for (const line of report) console.log(line);
const show = flag("--show");
if (show) {
  const [from, to = from] = show.split("-").map(Number);
  for (const line of describe(piece, from, to)) console.log(line);
}
console.log(`wrote ${out}`);
