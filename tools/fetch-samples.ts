// Builds the self-hosted piano sample subset in public/samples/ from the lossless masters of
// SplendidGrandPiano (sfzinstruments, FLAC, pinned commit): opus in ogg through ffmpeg
// (libopus) and AAC in m4a through macOS afconvert, whose AAC encoder beats ffmpeg's. Bitrates
// are tuned for size (about 4 MB per format) with full-length tails.
// Masters are cached in the OS temp dir. Needs ffmpeg (with libopus) and afconvert (macOS).
// Usage: npm run samples:fetch [-- --force]
import { execFileSync } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LAYERS } from "smplr";
import { SAMPLE_LAYERS, SAMPLE_ROOTS, sampleFile } from "../src/audio/samples.ts";

const MASTERS = "https://raw.githubusercontent.com/sfzinstruments/SplendidGrandPiano/1c595d827b7fd7f0be3134aaed0f90b3662a09cf/Samples";
const CACHE = join(tmpdir(), "cadenza-sample-masters");
const OUT = join(import.meta.dirname, "..", "public", "samples");
const OPUS_KBPS = 80; // VBR; 96 (smplr's own set) sounds the same and is 25% larger
const AAC_KBPS = 80; // constrained VBR; smplr's 128 kbps set came from a weaker encoder
const force = process.argv.includes("--force");

const ENCODERS: Record<string, (src: string, dst: string) => void> = {
  ogg: (src, dst) =>
    execFileSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-y", "-i", src, "-c:a", "libopus", "-b:a", `${OPUS_KBPS}k`, "-vbr", "on", "-compression_level", "10", "-map_metadata", "-1", dst]),
  m4a: (src, dst) => execFileSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", String(AAC_KBPS * 1000), "-s", "2", "-q", "127", src, dst]),
};

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

for (const tool of ["ffmpeg", "afconvert"]) {
  try {
    execFileSync("which", [tool], { stdio: "ignore" });
  } catch {
    throw new Error(`${tool} is needed to encode the samples (ffmpeg with libopus; afconvert ships with macOS)`);
  }
}

await mkdir(OUT, { recursive: true });
await mkdir(CACHE, { recursive: true });
const totals: Record<string, number> = {};
for (const layer of SAMPLE_LAYERS) {
  const source = LAYERS.find((l) => l.name === layer.source);
  if (!source) throw new Error(`smplr has no layer ${layer.source}`);
  for (const root of SAMPLE_ROOTS) {
    const entry = source.samples.find(([midi]) => midi === root);
    if (!entry) throw new Error(`layer ${layer.source} has no sample at ${root}`);
    const master = join(CACHE, `${entry[1]}.flac`);
    if (!(await exists(master))) {
      // Sequential on purpose: be gentle with the GitHub host.
      await writeFile(master, await download(`${MASTERS}/${encodeURIComponent(String(entry[1]))}.flac`));
      console.log(`fetched ${entry[1]}.flac`);
    }
    for (const [format, encode] of Object.entries(ENCODERS)) {
      const path = join(OUT, `${sampleFile(layer.file, root)}.${format}`);
      if (force || !(await exists(path))) {
        encode(master, path);
        console.log(`encoded ${path}`);
      }
      totals[format] = (totals[format] ?? 0) + (await stat(path)).size;
    }
  }
}
for (const [format, bytes] of Object.entries(totals)) {
  console.log(`${format}: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
}
