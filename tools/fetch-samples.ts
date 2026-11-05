// Downloads the self-hosted piano sample subset into public/samples/.
// Usage: npm run samples:fetch [-- --force]
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LAYERS } from "smplr";
import { SAMPLE_FORMATS, SAMPLE_LAYERS, SAMPLE_ROOTS, sampleFile } from "../src/audio/samples.ts";

const BASE = "https://smpldsnds.github.io/sfzinstruments-splendid-grand-piano/samples";
const OUT = join(import.meta.dirname, "..", "public", "samples");
const force = process.argv.includes("--force");

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

async function download(url: string): Promise<Uint8Array> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= 4) throw new Error(`${url}: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

await mkdir(OUT, { recursive: true });
const totals: Record<string, number> = {};
for (const layer of SAMPLE_LAYERS) {
  const source = LAYERS.find((l) => l.name === layer.source);
  if (!source) throw new Error(`smplr has no layer ${layer.source}`);
  for (const root of SAMPLE_ROOTS) {
    const entry = source.samples.find(([midi]) => midi === root);
    if (!entry) throw new Error(`layer ${layer.source} has no sample at ${root}`);
    const remoteName = String(entry[1]);
    for (const format of SAMPLE_FORMATS) {
      const path = join(OUT, `${sampleFile(layer.file, root)}.${format}`);
      if (force || !(await exists(path))) {
        // Sequential on purpose: be gentle with the GitHub Pages host.
        await writeFile(path, await download(`${BASE}/${encodeURIComponent(remoteName)}.${format}`));
        console.log(`fetched ${remoteName}.${format} -> ${path}`);
      }
      totals[format] = (totals[format] ?? 0) + (await stat(path)).size;
    }
  }
}
for (const [format, bytes] of Object.entries(totals)) {
  console.log(`${format}: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
}
